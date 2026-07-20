import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildAuthority, buildScopes, loadConfig, validateConfig } from "../extensions/defender-xdr/config.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";

function validConfig() {
  return {
    tenantId,
    clientId,
    authorityHost: "https://login.microsoftonline.com",
    apiBaseUrl: "https://graph.microsoft.com",
    redirectUri: "http://localhost",
    defaultLookback: "7d",
    maximumRows: 1000,
    schemaTtlHours: 168,
    scopeMode: "delegated",
    allowUnencryptedTokenCache: false,
  };
}

describe("configuration", () => {
  it("builds a tenant-specific authority and delegated/default scopes", () => {
    const config = validateConfig(validConfig());
    expect(buildAuthority(config)).toBe(`https://login.microsoftonline.com/${tenantId}`);
    expect(buildScopes(config)).toEqual(["https://graph.microsoft.com/ThreatHunting.Read.All"]);
    expect(buildScopes({ ...config, scopeMode: "default" })).toEqual(["https://graph.microsoft.com/.default"]);
  });

  it("applies environment overrides after stored settings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-config-"));
    const path = join(directory, "config.json");
    await writeFile(path, JSON.stringify(validConfig()));
    const config = await loadConfig({
      path,
      env: { PI_XDR_TENANT_ID: "33333333-3333-4333-8333-333333333333" },
    });
    expect(config.tenantId).toBe("33333333-3333-4333-8333-333333333333");
    expect(config.clientId).toBe(clientId);
  });

  it("supports matched sovereign-cloud environment overrides", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-config-"));
    const path = join(directory, "config.json");
    await writeFile(path, JSON.stringify(validConfig()));
    const config = await loadConfig({
      path,
      env: {
        PI_XDR_API_BASE_URL: "https://graph.microsoft.us",
        PI_XDR_AUTHORITY_HOST: "https://login.microsoftonline.us",
      },
    });
    expect(config.apiBaseUrl).toBe("https://graph.microsoft.us");
    expect(config.authorityHost).toBe("https://login.microsoftonline.us");
  });

  it("migrates the prerelease Defender endpoint to Microsoft Graph", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-config-"));
    const path = join(directory, "config.json");
    await writeFile(path, JSON.stringify({ ...validConfig(), apiBaseUrl: "https://api.security.microsoft.com" }));
    expect((await loadConfig({ path, env: {} })).apiBaseUrl).toBe("https://graph.microsoft.com");
  });

  it("accepts matched sovereign Graph and authority endpoints", () => {
    expect(validateConfig({
      ...validConfig(),
      apiBaseUrl: "https://graph.microsoft.us",
      authorityHost: "https://login.microsoftonline.us",
    }).apiBaseUrl).toBe("https://graph.microsoft.us");
  });

  it("rejects secrets, unsafe redirects, and token-exfiltration endpoints", () => {
    expect(() => validateConfig({ ...validConfig(), clientSecret: "never" })).toThrow("Client secrets");
    expect(() => validateConfig({ ...validConfig(), redirectUri: "https://example.test" })).toThrow("redirectUri");
    expect(() => validateConfig({ ...validConfig(), apiBaseUrl: "https://attacker.example" })).toThrow("official Microsoft Graph");
    expect(() => validateConfig({ ...validConfig(), authorityHost: "https://login.microsoftonline.us" })).toThrow("authorityHost");
  });
});
