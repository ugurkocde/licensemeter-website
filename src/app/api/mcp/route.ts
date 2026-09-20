import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { siteUrl } from "~/env";
import { db } from "~/server/db";
import { tenants } from "~/server/db/schema";
import { withTenant } from "~/server/db/tenant";
import { hasFeature, planFor } from "~/server/entitlement";
import { loadEntitlement } from "~/server/entitlementStore";
import {
  handleMessage,
  RPC_ERROR,
  rpcError,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "~/server/mcp/protocol";
import { verifyToken } from "~/server/mcp/tokens";
import { rateLimitDurable } from "~/server/rateLimit";

/**
 * The MCP endpoint (Streamable HTTP, revision 2025-11-25). One JSON-RPC message
 * per POST, answered as application/json; there is no event stream, so GET is
 * refused with 405 as the specification allows.
 *
 * Every request stands alone: the bearer token is verified, the workspace and
 * its entitlement are loaded again, and a workspace without the `mcp` feature
 * is refused with 402. A token therefore stops working on a downgrade and
 * works again after an upgrade, without being touched.
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;

const BASE_HEADERS = { "Cache-Control": "no-store" } as const;

const json = (
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  NextResponse.json(body, { status, headers: { ...BASE_HEADERS, ...headers } });

const unauthorized = (invalidToken: boolean) =>
  json(
    401,
    rpcError(
      null,
      RPC_ERROR.invalidRequest,
      invalidToken
        ? "The access token is invalid or revoked"
        : "A bearer token is required in the Authorization header",
    ),
    {
      "WWW-Authenticate": invalidToken
        ? 'Bearer realm="LicenseMeter MCP", error="invalid_token"'
        : 'Bearer realm="LicenseMeter MCP"',
    },
  );

/** The token from `Authorization: Bearer ...`. Never read from the URL. */
const bearerToken = (request: Request): string | null => {
  const header = request.headers.get("authorization");
  const match = header ? /^Bearer +([^\s]+)$/i.exec(header.trim()) : null;
  return match?.[1] ?? null;
};

/**
 * Browsers send Origin, MCP clients outside a browser do not. When the header
 * is present it must be this site's own origin, which stops a web page on
 * another origin from driving the endpoint (DNS rebinding included).
 */
const originAllowed = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).origin === new URL(siteUrl()).origin;
  } catch {
    return false;
  }
};

const acceptsJson = (request: Request): boolean => {
  const accept = request.headers.get("accept");
  if (!accept) return true;
  return /(^|[\s,])(application\/json|application\/\*|\*\/\*)/i.test(accept);
};

/** Reads at most MAX_BODY_BYTES; null when the body is larger. */
const readCapped = async (request: Request): Promise<string | null> => {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
};

export const POST = async (request: Request) => {
  if (!originAllowed(request)) {
    return json(
      403,
      rpcError(null, RPC_ERROR.invalidRequest, "Origin not allowed"),
    );
  }

  const token = bearerToken(request);
  if (!token) return unauthorized(false);
  const verified = await verifyToken(token);
  if (!verified) return unauthorized(true);

  // Keyed by the token's row id, so the token itself is never stored or logged.
  const withinLimit = await rateLimitDurable(
    `mcp:${verified.tokenId}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
    "deny",
  );
  if (!withinLimit) {
    return json(
      429,
      rpcError(null, RPC_ERROR.rateLimited, "Too many requests for this token"),
      { "Retry-After": String(RATE_LIMIT_WINDOW_MS / 1000) },
    );
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, verified.tenantId),
  });
  if (!tenant) return unauthorized(true);

  const now = new Date();
  const entitlement = await loadEntitlement(tenant, now);
  if (!hasFeature(entitlement, "mcp")) {
    return json(
      402,
      rpcError(
        null,
        RPC_ERROR.featureRequired,
        "The MCP server is not included in this workspace's plan. Upgrade the workspace to use this token again.",
        { reason: "featureRequired", feature: "mcp", plan: planFor("mcp") },
      ),
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    return json(
      415,
      rpcError(
        null,
        RPC_ERROR.invalidRequest,
        "Content-Type must be application/json",
      ),
    );
  }
  if (!acceptsJson(request)) {
    return json(
      406,
      rpcError(
        null,
        RPC_ERROR.invalidRequest,
        "The Accept header must allow application/json",
      ),
    );
  }

  // Absent means a client from before the header existed; present must match.
  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return json(
      400,
      rpcError(
        null,
        RPC_ERROR.invalidRequest,
        `Unsupported MCP-Protocol-Version. Supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}`,
        { supported: SUPPORTED_PROTOCOL_VERSIONS },
      ),
    );
  }

  const raw = await readCapped(request);
  if (raw === null) {
    return json(
      413,
      rpcError(null, RPC_ERROR.invalidRequest, "Request body too large"),
    );
  }
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return json(400, rpcError(null, RPC_ERROR.parse, "Parse error"));
  }

  const reply = await withTenant(db, tenant.id, () =>
    handleMessage(message, { tenant, entitlement, now }),
  );
  if (reply.body === null) {
    return new NextResponse(null, {
      status: reply.status,
      headers: BASE_HEADERS,
    });
  }
  return json(reply.status, reply.body);
};

const methodNotAllowed = () =>
  json(405, rpcError(null, RPC_ERROR.invalidRequest, "Method not allowed"), {
    Allow: "POST",
  });

// No server-initiated stream and no sessions to end.
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
