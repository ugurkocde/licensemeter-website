import { ConfidentialClientApplication } from "@azure/msal-node";

import { env } from "~/env";
import { GUID } from "~/lib/metering";
import { reclaimRoles, RECLAIM_ROLE } from "~/lib/reclaim";

/** How the reclaim app authenticates in one customer tenant. */
export type ReclaimCredential =
  | { mode: "managed"; tid: string }
  | {
      mode: "byo";
      credType: "secret";
      tid: string;
      clientId: string;
      secret: string;
    }
  | {
      mode: "byo";
      credType: "cert";
      tid: string;
      clientId: string;
      privateKey: string;
      thumbprint: string;
    };

export const RECLAIM_ERRORS: Record<string, string> = {
  configuration:
    "One-click reclaim is not configured on this installation. Ask the operator to configure its separate Microsoft application, or use your own app registration.",
  consent: `Microsoft has not granted ${RECLAIM_ROLE} to the reclaim app in this tenant yet. Approve consent, allow a few minutes for it to take effect, then verify again.`,
  credential:
    "Microsoft refused the app credentials. Check the application ID, the client secret or certificate, and that the secret has not expired.",
  wrong_tenant:
    "The token was issued for a different Microsoft tenant than the one connected to this workspace.",
  extra: `The reclaim app holds more Microsoft Graph application permissions than ${RECLAIM_ROLE}. Remove the other permissions from the app registration, then verify again.`,
  directory_role:
    "The reclaim app is assigned a Microsoft Entra administrator role. Remove the role assignment from the app, then verify again.",
  unavailable: "Microsoft could not be reached. Try again in a minute.",
};

export class ReclaimError extends Error {
  constructor(
    public code: string,
    /** Extra application permissions found on the token, for "extra". */
    public extra: string[] = [],
  ) {
    const base = RECLAIM_ERRORS[code] ?? RECLAIM_ERRORS.unavailable!;
    super(extra.length > 0 ? `${base} Found: ${extra.join(", ")}.` : base);
  }
}

export const reclaimErrorText = (err: unknown): string =>
  err instanceof ReclaimError ? err.message : RECLAIM_ERRORS.unavailable!;

const sameId = (a: string | undefined, b: string | undefined) =>
  a !== undefined && a.toLowerCase() === b?.toLowerCase();

/** App ids the reclaim app must never share: sign-in, connector, metering. */
export const reservedClientIds = (): string[] =>
  [
    env.CONNECTOR_CLIENT_ID,
    env.AUTH_MICROSOFT_ENTRA_ID_ID,
    env.METERING_CLIENT_ID,
  ].filter((id): id is string => Boolean(id));

/** Whether the managed reclaim app is configured, and kept separate. */
export function reclaimConfigured(): boolean {
  const id = env.RECLAIM_CLIENT_ID;
  return Boolean(
    id &&
    env.RECLAIM_CLIENT_SECRET &&
    !reservedClientIds().some((reserved) => sameId(reserved, id)),
  );
}

const buildApp = (cred: ReclaimCredential): ConfidentialClientApplication => {
  const authority = `https://login.microsoftonline.com/${cred.tid}`;
  if (cred.mode === "managed") {
    if (!reclaimConfigured()) throw new ReclaimError("configuration");
    return new ConfidentialClientApplication({
      auth: {
        clientId: env.RECLAIM_CLIENT_ID!,
        clientSecret: env.RECLAIM_CLIENT_SECRET!,
        authority,
      },
    });
  }
  if (reservedClientIds().some((id) => sameId(id, cred.clientId)))
    throw new ReclaimError("configuration");
  if (cred.credType === "secret")
    return new ConfidentialClientApplication({
      auth: { clientId: cred.clientId, clientSecret: cred.secret, authority },
    });
  return new ConfidentialClientApplication({
    auth: {
      clientId: cred.clientId,
      authority,
      clientCertificate: {
        thumbprint: cred.thumbprint,
        privateKey: cred.privateKey,
      },
    },
  });
};

type Claims = { roles?: unknown; tid?: unknown; oid?: unknown; wids?: unknown };

const decodeClaims = (jwt: string): Claims => {
  try {
    return JSON.parse(
      Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Claims;
  } catch {
    return {};
  }
};

/**
 * Checks a freshly issued app-only token: it must name this tenant, carry the
 * service principal identity, and hold exactly the reclaim permission. The
 * token comes straight from Microsoft over TLS, so its claims are trusted
 * without a signature check, like the connector and metering consent checks.
 */
export function checkReclaimToken(jwt: string, tid: string): void {
  const claims = decodeClaims(jwt);
  if (typeof claims.tid !== "string" || !sameId(claims.tid, tid))
    throw new ReclaimError("wrong_tenant");
  // No oid: the service principal is not visible yet, so consent is pending.
  if (typeof claims.oid !== "string") throw new ReclaimError("consent");
  const roles = Array.isArray(claims.roles)
    ? claims.roles.filter((r): r is string => typeof r === "string")
    : [];
  const check = reclaimRoles(roles);
  if (!check.ok)
    throw check.code === "extra"
      ? new ReclaimError("extra", check.extra)
      : new ReclaimError("consent");
  // Entra directory roles assigned to the service principal (User
  // Administrator, Global Administrator, ...) appear as role template ids in
  // wids and would make the stored credential far stronger than the one
  // permission. The default member template carries no admin rights.
  const wids = Array.isArray(claims.wids)
    ? claims.wids.filter(
        (w): w is string =>
          typeof w === "string" && w.toLowerCase() !== DEFAULT_MEMBER_ROLE,
      )
    : [];
  if (wids.length > 0)
    throw new ReclaimError(
      "directory_role",
      wids.map((w) => `directory role ${w}`),
    );
}

/** The "User" role template every member holds; not an admin role. */
const DEFAULT_MEMBER_ROLE = "b79fbf4d-3ef9-4689-8143-76b194e85509";

// Specific codes first: the AADSTS700016 text ("... or consented to by any
// user") also contains the word consent.
const CREDENTIAL_ERRORS =
  /AADSTS7000215|AADSTS7000222|AADSTS700027|invalid client secret|certificate|thumbprint/i;
const UNKNOWN_APP = /AADSTS700016/i;
const NOT_CONSENTED = /AADSTS650051|AADSTS65001|AADSTS7000229|consent/i;

/** The error code for a failed token request, from Microsoft's message. */
export function tokenErrorCode(
  message: string,
  mode: ReclaimCredential["mode"],
): string {
  // An app unknown in this tenant: a wrong application id for your own app,
  // consent never granted for LicenseMeter's.
  if (UNKNOWN_APP.test(message))
    return mode === "byo" ? "credential" : "consent";
  if (mode === "byo" && CREDENTIAL_ERRORS.test(message)) return "credential";
  if (NOT_CONSENTED.test(message)) return "consent";
  return "unavailable";
}

/** An app-only Graph token for the reclaim app, checked before it is used. */
export async function reclaimToken(cred: ReclaimCredential): Promise<string> {
  if (!GUID.test(cred.tid)) throw new ReclaimError("wrong_tenant");
  const app = buildApp(cred);
  let token: string | undefined;
  try {
    const result = await app.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });
    token = result?.accessToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log only the message: MSAL errors can carry request context.
    console.error("[reclaim] token acquisition failed:", message);
    throw new ReclaimError(tokenErrorCode(message, cred.mode));
  }
  if (!token) throw new ReclaimError("consent");
  checkReclaimToken(token, cred.tid);
  return token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Verifies consent, waiting out the minute a new service principal can take
 * to show up in tokens. Only "consent" is retried; a wrong tenant, extra
 * permissions or bad credentials will not fix themselves.
 */
export async function verifyReclaimCredential(
  cred: ReclaimCredential,
  waits: readonly number[] = [10_000, 20_000],
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await reclaimToken(cred);
      return;
    } catch (err) {
      const wait = waits[attempt];
      if (
        !(err instanceof ReclaimError) ||
        err.code !== "consent" ||
        wait === undefined
      )
        throw err;
      await sleep(wait);
    }
  }
}
