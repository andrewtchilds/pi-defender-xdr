import { describe, expect, it } from "vitest";
import { XdrAuth } from "../../extensions/defender-xdr/auth.js";
import { runHuntingQuery } from "../../extensions/defender-xdr/client.js";
import { loadConfig } from "../../extensions/defender-xdr/config.js";

const enabled = process.env.PI_XDR_REAL_TENANT_TESTS === "1";

describe.skipIf(!enabled)("opt-in real-tenant validation", () => {
  it("uses existing cached credentials to run a bounded Graph hunting query", async () => {
    const config = await loadConfig();
    const auth = await XdrAuth.create(config);
    expect(await auth.accounts(), "Run /xdr-login before the real-tenant test").not.toHaveLength(0);

    // Silent acquisition is intentional: automated tests must never open a browser.
    const result = await runHuntingQuery(auth, config, {
      query: "AlertInfo\n| project Timestamp, AlertId, Title, Severity\n| take 1",
      timespan: "1d",
    });
    expect(Array.isArray(result.schema)).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeLessThanOrEqual(1);
  }, 60_000);
});
