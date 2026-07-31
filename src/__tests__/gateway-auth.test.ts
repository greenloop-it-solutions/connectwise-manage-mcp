/**
 * Unit tests for gateway mode's single combined-header credential parsing
 * (resolveGatewayConfig in mcp-server.ts).
 */

import { describe, it, expect } from "vitest";
import { resolveGatewayConfig, DEFAULT_GATEWAY_HEADER_NAME } from "../mcp-server.js";

function headerGetter(value: string | undefined) {
  return (name: string) => (name === DEFAULT_GATEWAY_HEADER_NAME ? value : undefined);
}

function encode(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64");
}

describe("resolveGatewayConfig", () => {
  it("parses companyId+publicKey:privateKey@clientId with no serverUrl", () => {
    const { config, error } = resolveGatewayConfig(
      headerGetter(encode("acme+pub:priv@client-guid")),
    );
    expect(error).toBeUndefined();
    expect(config).toEqual({
      baseUrl: "https://api-na.myconnectwise.net",
      companyId: "acme",
      publicKey: "pub",
      privateKey: "priv",
      clientId: "client-guid",
    });
  });

  it("parses an optional trailing [serverUrl]", () => {
    const { config, error } = resolveGatewayConfig(
      headerGetter(encode("acme+pub:priv@client-guid[https://cwm.example.com]")),
    );
    expect(error).toBeUndefined();
    expect(config?.baseUrl).toBe("https://cwm.example.com");
  });

  it("errors when the header is missing", () => {
    const { config, error } = resolveGatewayConfig(headerGetter(undefined));
    expect(config).toBeUndefined();
    expect(error).toMatch(new RegExp(DEFAULT_GATEWAY_HEADER_NAME));
  });

  it("errors on invalid base64", () => {
    const { config, error } = resolveGatewayConfig(headerGetter("not valid base64!!"));
    expect(config).toBeUndefined();
    expect(error).toBeDefined();
  });

  it("errors when the decoded value doesn't match the expected shape", () => {
    const { config, error } = resolveGatewayConfig(headerGetter(encode("not-the-right-format")));
    expect(config).toBeUndefined();
    expect(error).toMatch(/Malformed gateway credentials header/);
  });

  it("respects a custom header name", () => {
    const custom = (name: string) =>
      name === "x-custom-key" ? encode("acme+pub:priv@client-guid") : undefined;
    const { config, error } = resolveGatewayConfig(custom, "x-custom-key");
    expect(error).toBeUndefined();
    expect(config?.companyId).toBe("acme");
  });
});
