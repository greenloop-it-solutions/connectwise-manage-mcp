/**
 * Shared MCP server factory for ConnectWise Manage.
 *
 * This module is **side-effect free** (importing it never starts a transport),
 * so it can be reused by every entrypoint:
 * - `index.ts`  — stdio + Node HTTP transport
 * - `worker.ts` — Cloudflare Workers (Web Standard) transport
 *
 * Credentials are resolved per request, in order:
 * 1. An explicit `CwManageConfig` override (gateway mode / Workers headers).
 * 2. `getConfig()` reading from `process.env` (env mode).
 *
 * `tools/list` and `initialize` work without credentials; when no config is
 * available, only a single diagnostic `cw_test_connection` tool is registered,
 * so credential-requiring calls fail with a clear, graceful message.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfig, CwManageClient, type CwManageConfig } from "./api-client.js";
import { registerCardResources } from "./resources.js";
import { registerTicketTools } from "./tools/tickets.js";
import { registerCompanyTools } from "./tools/companies.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerTimeEntryTools } from "./tools/time-entries.js";
import { registerMemberTools } from "./tools/members.js";
import { registerConfigurationTools } from "./tools/configurations.js";
import { registerServiceTools } from "./tools/service.js";
import { registerActivityTools } from "./tools/activities.js";
import { registerCatalogTools } from "./tools/catalog.js";
import { registerHealthTools } from "./tools/health.js";
import { registerAgreementTools } from "./tools/agreements.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { registerScheduleTools } from "./tools/schedule.js";

export type { CwManageConfig };

/**
 * Build a validated CwManageConfig from raw values.
 * Returns `{ config }` on success or `{ error }` when required fields are
 * missing. Shared by every transport (Node HTTP headers, Workers headers).
 */
export function buildConfig(
  companyId: string | undefined,
  publicKey: string | undefined,
  privateKey: string | undefined,
  clientId: string | undefined,
  baseUrl?: string,
): { config?: CwManageConfig; error?: string } {
  if (!companyId || !publicKey || !privateKey || !clientId) {
    return {
      error:
        "Missing or incomplete ConnectWise credentials (company ID, public key, private key, client ID)",
    };
  }

  const resolvedBaseUrl = (
    baseUrl || "https://api-na.myconnectwise.net"
  ).replace(/\/+$/, "");

  return {
    config: {
      baseUrl: resolvedBaseUrl,
      companyId,
      publicKey,
      privateKey,
      clientId,
    },
  };
}

/** Header name gateway mode reads by default when GATEWAY_HEADER_NAME is unset. */
export const DEFAULT_GATEWAY_HEADER_NAME = "x-cw-gateway-key";

/**
 * Resolve gateway mode's configured header name from `process.env`. Node-only
 * (stdio/HTTP entrypoint) — Cloudflare Workers doesn't populate `process.env`
 * from its `env` bindings, so `worker.ts` resolves its own header name from
 * its `Env` and passes it into `resolveGatewayConfig` explicitly instead.
 */
export function gatewayHeaderName(): string {
  return (process.env.GATEWAY_HEADER_NAME || DEFAULT_GATEWAY_HEADER_NAME).toLowerCase();
}

/**
 * Parse a single gateway credentials header value:
 *   Base64("{companyId}+{publicKey}:{privateKey}@{clientId}[{serverUrl}]")
 * `[{serverUrl}]` is optional. Returns the decoded parts, or an error when the
 * value isn't valid base64 or doesn't match the expected shape.
 */
function parseGatewayHeaderValue(raw: string): {
  companyId?: string;
  publicKey?: string;
  privateKey?: string;
  clientId?: string;
  baseUrl?: string;
  error?: string;
} {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64").toString("utf8");
  } catch {
    return { error: "Failed to base64-decode the gateway credentials header" };
  }

  const match = decoded.match(/^([^+]+)\+([^:]+):([^@]+)@([^[]+)(?:\[([^\]]+)\])?$/);
  if (!match) {
    return {
      error:
        'Malformed gateway credentials header. Expected Base64("{companyId}+{publicKey}:{privateKey}@{clientId}[{serverUrl}]")',
    };
  }

  const [, companyId, publicKey, privateKey, clientId, baseUrl] = match;
  return { companyId, publicKey, privateKey, clientId, baseUrl };
}

/**
 * Resolve per-request gateway credentials from a single combined header.
 *
 * Works with any transport: pass a getter that returns a (lowercased) header
 * value, and the (already-lowercased) header name to look up — each
 * entrypoint resolves that name from its own environment mechanism (Node
 * `process.env` via `gatewayHeaderName()`, Workers' `Env` bindings, etc).
 * Returns `{ config }` on success, or `{ error }` when the header is missing
 * or malformed.
 */
export function resolveGatewayConfig(
  getHeader: (lowerName: string) => string | undefined,
  headerName: string = DEFAULT_GATEWAY_HEADER_NAME,
): { config?: CwManageConfig; error?: string } {
  const raw = getHeader(headerName);

  if (!raw) {
    return { error: `Missing credentials: the '${headerName}' header is required` };
  }

  const parsed = parseGatewayHeaderValue(raw);
  if (parsed.error) {
    return { error: parsed.error };
  }

  return buildConfig(
    parsed.companyId,
    parsed.publicKey,
    parsed.privateKey,
    parsed.clientId,
    parsed.baseUrl,
  );
}

/**
 * Create a fresh MCP server instance with all handlers registered.
 * Called once for stdio, or per-request for HTTP / Workers transports.
 *
 * @param configOverride - Optional config (gateway mode / Workers headers).
 *   When provided, the client is built from it instead of reading process.env.
 */
export function createMcpServer(configOverride?: CwManageConfig): McpServer {
  const server = new McpServer({
    name: "connectwise-manage-mcp",
    version: "1.4.0",
  });

  // MCP Apps (SEP-1865): the ui:// ticket card is static embedded HTML, so it
  // is served with or without credentials (hosts may prefetch it).
  registerCardResources(server);

  const config = configOverride ?? getConfig();

  if (!config) {
    // Register a single diagnostic tool so the client gets a clear error
    server.tool(
      "cw_test_connection",
      "Test the connection to ConnectWise Manage.",
      {},
      async () => ({
        content: [
          {
            type: "text",
            text: [
              "Error: Missing ConnectWise Manage credentials.",
              "",
              "Required environment variables:",
              "  CW_MANAGE_COMPANY_ID        - Your ConnectWise company identifier",
              "  CW_MANAGE_PUBLIC_KEY        - API member public key",
              "  CW_MANAGE_PRIVATE_KEY       - API member private key",
              "  CW_MANAGE_CLIENT_ID         - Client ID from ConnectWise Developer Portal",
              "",
              "Optional:",
              "  CW_MANAGE_URL               - API base URL",
              "    Cloud:       https://api-na.myconnectwise.net (default)",
              "                 https://api-eu.myconnectwise.net",
              "                 https://api-au.myconnectwise.net",
              "    Self-hosted: https://cwm.yourcompany.com",
              "  CW_MANAGE_REJECT_UNAUTHORIZED - Set to 'false' for self-signed certs",
            ].join("\n"),
          },
        ],
        isError: true,
      }),
    );
    return server;
  }

  const client = new CwManageClient(config);

  registerTicketTools(server, client);
  registerCompanyTools(server, client);
  registerContactTools(server, client);
  registerProjectTools(server, client);
  registerTimeEntryTools(server, client);
  registerMemberTools(server, client);
  registerConfigurationTools(server, client);
  registerServiceTools(server, client);
  registerActivityTools(server, client);
  registerCatalogTools(server, client);
  registerHealthTools(server, client);
  registerAgreementTools(server, client);
  registerOpportunityTools(server, client);
  registerScheduleTools(server, client);

  return server;
}
