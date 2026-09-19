import {
  callTool,
  TOOL_DEFINITIONS,
  type ToolContext,
} from "~/server/mcp/tools";

/**
 * JSON-RPC 2.0 handling for the MCP endpoint, per the Model Context Protocol
 * revision 2025-11-25 (Streamable HTTP, handshake based). The two revisions
 * before it are accepted as well, because `initialize`, `ping`, `tools/list`
 * and `tools/call` did not change between them. The server is stateless: it
 * issues no session id and keeps nothing between requests. Transport concerns
 * (authentication, Origin, body size) live in the route.
 */

export const LATEST_PROTOCOL_VERSION = "2025-11-25";
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  LATEST_PROTOCOL_VERSION,
  "2025-06-18",
  "2025-03-26",
];

export const SERVER_INFO = {
  name: "licensemeter",
  title: "LicenseMeter",
  version: "1.0.0",
} as const;

const INSTRUCTIONS =
  "Read-only access to one LicenseMeter workspace: license waste, findings, trends and the license inventory. Amounts are in the workspace currency, per month unless a field says otherwise.";

export const RPC_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /** Implementation-defined: the workspace's plan does not include MCP. */
  featureRequired: -32050,
  /** Implementation-defined: too many requests for this token. */
  rateLimited: -32051,
} as const;

type RpcId = string | number;

export type RpcReply = {
  /** HTTP status for the response. */
  status: number;
  /** Null for an accepted notification or response: 202 with no body. */
  body: Record<string, unknown> | null;
};

export const rpcError = (
  id: RpcId | null,
  code: number,
  message: string,
  data?: unknown,
): Record<string, unknown> => ({
  jsonrpc: "2.0",
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});

const rpcResult = (id: RpcId, result: unknown): RpcReply => ({
  status: 200,
  body: { jsonrpc: "2.0", id, result },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRpcId = (value: unknown): value is RpcId =>
  typeof value === "string" ||
  (typeof value === "number" && Number.isFinite(value));

const initialize = (id: RpcId, params: unknown): RpcReply => {
  const requested = isRecord(params) ? params.protocolVersion : undefined;
  if (typeof requested !== "string") {
    return {
      status: 200,
      body: rpcError(
        id,
        RPC_ERROR.invalidParams,
        "initialize requires params.protocolVersion",
      ),
    };
  }
  // Echo a version this server speaks, otherwise offer the latest one; the
  // client disconnects when it cannot use it.
  const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
  return rpcResult(id, {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  });
};

const toolsCall = async (
  id: RpcId,
  params: unknown,
  ctx: ToolContext,
): Promise<RpcReply> => {
  const invalidParams = (message: string): RpcReply => ({
    status: 200,
    body: rpcError(id, RPC_ERROR.invalidParams, message),
  });
  if (!isRecord(params) || typeof params.name !== "string") {
    return invalidParams("tools/call requires params.name");
  }
  if (params.arguments !== undefined && !isRecord(params.arguments)) {
    return invalidParams("params.arguments must be an object");
  }
  const outcome = await callTool(params.name, params.arguments ?? {}, ctx);
  if (outcome === null) return invalidParams("Unknown tool");
  if (!outcome.ok) {
    return rpcResult(id, {
      content: [{ type: "text", text: outcome.message }],
      isError: true,
    });
  }
  return rpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(outcome.data) }],
    structuredContent: outcome.data,
    isError: false,
  });
};

/**
 * Answers one decoded JSON-RPC message. Batches are refused: the targeted
 * revision removed them. Notifications and client responses are accepted with
 * 202 and no body, whatever their method.
 */
export const handleMessage = async (
  message: unknown,
  ctx: ToolContext,
): Promise<RpcReply> => {
  const invalidRequest = (text: string): RpcReply => ({
    status: 400,
    body: rpcError(null, RPC_ERROR.invalidRequest, text),
  });

  if (Array.isArray(message)) {
    return invalidRequest("JSON-RPC batches are not supported");
  }
  if (!isRecord(message) || message.jsonrpc !== "2.0") {
    return invalidRequest("Not a JSON-RPC 2.0 message");
  }
  const { id, method, params } = message;

  if (typeof method !== "string") {
    // A response to a server request. This server never sends one, so there
    // is nothing to match it to: accept and drop it.
    const isResponse =
      isRpcId(id) && ("result" in message || "error" in message);
    return isResponse
      ? { status: 202, body: null }
      : invalidRequest("Missing method");
  }
  if (id === undefined) return { status: 202, body: null };
  if (!isRpcId(id)) return invalidRequest("id must be a string or a number");

  try {
    switch (method) {
      case "initialize":
        return initialize(id, params);
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        // The list fits one page, so no cursor is ever issued.
        if (isRecord(params) && params.cursor !== undefined) {
          return {
            status: 200,
            body: rpcError(id, RPC_ERROR.invalidParams, "Unknown cursor"),
          };
        }
        return rpcResult(id, { tools: TOOL_DEFINITIONS });
      case "tools/call":
        return await toolsCall(id, params, ctx);
      default:
        return {
          status: 200,
          body: rpcError(id, RPC_ERROR.methodNotFound, "Method not found"),
        };
    }
  } catch (err) {
    console.error(`[mcp] ${method} failed for workspace ${ctx.tenant.id}`, err);
    return {
      status: 200,
      body: rpcError(id, RPC_ERROR.internal, "Internal error"),
    };
  }
};
