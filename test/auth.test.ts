import { describe, expect, it } from "vitest";
import { verifyDefenderToken } from "../extensions/defender-xdr/auth.js";

const config = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  apiBaseUrl: "https://graph.microsoft.com",
};

function token(claims: Record<string, unknown>): string {
  return `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

describe("Defender access-token claim checks", () => {
  it("accepts Graph URL or application-ID audiences with the delegated scope", () => {
    for (const aud of [config.apiBaseUrl, "00000003-0000-0000-c000-000000000000"]) {
      expect(() => verifyDefenderToken(token({
        aud,
        tid: config.tenantId,
        scp: "openid ThreatHunting.Read.All profile",
      }), config)).not.toThrow();
    }
  });

  it("rejects wrong audiences without including the token", () => {
    expect(() => verifyDefenderToken(token({ aud: "https://api.security.microsoft.com", scp: "ThreatHunting.Read.All" }), config))
      .toThrow("audience");
  });

  it("rejects missing or mismatched tenant claims", () => {
    const base = { aud: config.apiBaseUrl, scp: "ThreatHunting.Read.All" };
    expect(() => verifyDefenderToken(token(base), config)).toThrow("tenant");
    expect(() => verifyDefenderToken(token({ ...base, tid: "22222222-2222-4222-8222-222222222222" }), config)).toThrow("tenant");
  });

  it("rejects application permissions in place of delegated scope", () => {
    expect(() => verifyDefenderToken(token({ aud: config.apiBaseUrl, roles: ["ThreatHunting.Read.All"] }), config))
      .toThrow("delegated ThreatHunting.Read.All");
  });
});
