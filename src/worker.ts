/**
 * Cloudflare Workers entry point for the ConnectWise Manage MCP Server.
 *
 * Serves the full MCP server over the Streamable HTTP transport using the SDK's
 * Web Standard transport (Request/Response), which runs natively on Workers.
 * It reuses the exact same `createMcpServer()` factory as the stdio / Node HTTP
 * entrypoints (see `mcp-server.ts`), so there is no second tool implementation
 * to maintain.
 *
 * Credentials are resolved per request, in order:
 * 1. Gateway header (when AUTH_MODE=gateway): a single header (name from
 *    GATEWAY_HEADER_NAME, default "x-cw-gateway-key") carrying
 *    Base64("{companyId}+{publicKey}:{privateKey}@{clientId}[{serverUrl}]").
 * 2. Worker secrets / vars (env mode):
 *    - CW_MANAGE_COMPANY_ID
 *    - CW_MANAGE_PUBLIC_KEY
 *    - CW_MANAGE_PRIVATE_KEY
 *    - CW_MANAGE_CLIENT_ID
 *    - CW_MANAGE_URL (optional)
 *
 * `tools/list` and `initialize` work without credentials; only `tools/call`
 * requires them.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  createMcpServer,
  resolveGatewayConfig,
  buildConfig,
  DEFAULT_GATEWAY_HEADER_NAME,
  type CwManageConfig,
} from "./mcp-server.js";

export interface Env {
  CW_MANAGE_COMPANY_ID?: string;
  CW_MANAGE_PUBLIC_KEY?: string;
  CW_MANAGE_PRIVATE_KEY?: string;
  CW_MANAGE_CLIENT_ID?: string;
  CW_MANAGE_URL?: string;
  AUTH_MODE?: string;
  GATEWAY_HEADER_NAME?: string;
  LOG_LEVEL?: string;
}

/** Workers doesn't populate `process.env` from `Env` bindings, so resolve it explicitly here. */
function gatewayHeaderName(env: Env): string {
  return (env.GATEWAY_HEADER_NAME || DEFAULT_GATEWAY_HEADER_NAME).toLowerCase();
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": `Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, ${gatewayHeaderName(env)}`,
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  };
}

function json(body: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

function withCors(res: Response, env: Env): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(env))) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // Shallow, unauthenticated liveness probe.
    if (url.pathname === "/health" || url.pathname === "/healthz") {
      return json({ status: "ok" }, env);
    }

    if (url.pathname === "/mcp") {
      const isGatewayMode = (env.AUTH_MODE ?? "env") === "gateway";

      let configOverride: CwManageConfig | undefined;
      if (isGatewayMode) {
        const headerName = gatewayHeaderName(env);
        const { config, error } = resolveGatewayConfig(
          (name) => request.headers.get(name) ?? undefined,
          headerName,
        );
        if (error) {
          return json(
            {
              error: "Missing credentials",
              message: error,
              required: [headerName],
            },
            env,
            401,
          );
        }
        configOverride = config;
      } else {
        // env mode: build config from Worker secrets if present.
        // (Absent creds are fine — tools/list still works, tools/call errors.)
        const { config } = buildConfig(
          env.CW_MANAGE_COMPANY_ID,
          env.CW_MANAGE_PUBLIC_KEY,
          env.CW_MANAGE_PRIVATE_KEY,
          env.CW_MANAGE_CLIENT_ID,
          env.CW_MANAGE_URL,
        );
        configOverride = config;
      }

      // Fresh server + transport per request (stateless).
      const server = createMcpServer(configOverride);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);

      try {
        const response = await transport.handleRequest(request);
        return withCors(response, env);
      } finally {
        await transport.close();
        await server.close();
      }
    }

    return json({ error: "Not found", endpoints: ["/mcp", "/health"] }, env, 404);
  },
};
