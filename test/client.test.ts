import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticationRequiredError, type XdrAuth } from "../extensions/defender-xdr/auth.js";
import { runHuntingQuery, testAdvancedHuntingConnectivity } from "../extensions/defender-xdr/client.js";
import type { XdrConfig } from "../extensions/defender-xdr/config.js";

const config = { apiBaseUrl: "https://graph.microsoft.com" } as XdrConfig;

function authWithToken(): XdrAuth {
  return { acquireTokenSilent: vi.fn(async () => ({ accessToken: "secret-token" })) } as unknown as XdrAuth;
}

function graphResponse(results: Record<string, unknown>[] = [], schema: Record<string, unknown>[] = []): Response {
  return new Response(JSON.stringify({ schema, results }), { status: 200 });
}

afterEach(() => vi.restoreAllMocks());

describe("Microsoft Graph hunting client", () => {
  it("returns successful and empty query results", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://graph.microsoft.com/v1.0/security/runHuntingQuery");
      expect(init.headers).toMatchObject({ authorization: "Bearer secret-token" });
      expect(JSON.parse(String(init.body))).toEqual({ Query: "DeviceInfo | take 1", Timespan: "P7D" });
      return graphResponse([{ DeviceId: "device" }], [{ name: "DeviceId", type: "String" }]);
    });
    const populated = await runHuntingQuery(authWithToken(), config, { query: "DeviceInfo | take 1", timespan: "7d" }, undefined, { fetch: fetchMock as typeof fetch });
    expect(populated.results).toHaveLength(1);

    const empty = await runHuntingQuery(authWithToken(), config, { query: "DeviceInfo | where false" }, undefined, { fetch: vi.fn(async () => graphResponse()) as typeof fetch });
    expect(empty).toEqual({ schema: [], results: [] });
  });

  it("normalizes invalid KQL and RBAC failures without leaking credentials", async () => {
    const invalid = vi.fn(async () => new Response(JSON.stringify({ error: { code: "BadRequest", message: "Bad KQL Bearer should-not-leak" } }), { status: 400 }));
    await expect(runHuntingQuery(authWithToken(), config, { query: "not valid" }, undefined, { fetch: invalid as typeof fetch }))
      .rejects.toThrow("Invalid hunting query (400): Bad KQL Bearer [REDACTED]");

    const denied = vi.fn(async () => new Response(JSON.stringify({ error: { code: "Forbidden", message: "Denied" } }), { status: 403 }));
    await expect(runHuntingQuery(authWithToken(), config, { query: "DeviceInfo" }, undefined, { fetch: denied as typeof fetch }))
      .rejects.toThrow("ThreatHunting.Read.All admin consent");
  });

  it("propagates interaction-required authentication without opening a browser", async () => {
    const auth = { acquireTokenSilent: vi.fn(async () => { throw new AuthenticationRequiredError(); }) } as unknown as XdrAuth;
    const fetchMock = vi.fn();
    await expect(runHuntingQuery(auth, config, { query: "DeviceInfo" }, undefined, { fetch: fetchMock }))
      .rejects.toThrow("Run /xdr-login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a bounded 429 response using Retry-After", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(graphResponse());
    const sleep = vi.fn(async () => undefined);
    await expect(runHuntingQuery(authWithToken(), config, { query: "DeviceInfo" }, undefined, { fetch: fetchMock, sleep })).resolves.toEqual({ schema: [], results: [] });
    expect(sleep).toHaveBeenCalledWith(1000, undefined);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns normalized throttling diagnostics when retries are disabled", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429, headers: { "retry-after": "42" } }));
    const promise = runHuntingQuery(authWithToken(), config, { query: "DeviceInfo" }, undefined, { fetch: fetchMock as typeof fetch, maxRetries: 0 });
    await expect(promise).rejects.toMatchObject({ status: 429, retryAfterSeconds: 42 });
  });

  it("supports cancellation", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      if (init.signal?.aborted) reject(new DOMException("aborted", "AbortError"));
      else init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const promise = runHuntingQuery(authWithToken(), config, { query: "DeviceInfo" }, controller.signal, { fetch: fetchMock as typeof fetch });
    controller.abort();
    await expect(promise).rejects.toThrow("query cancelled");
  });

  it("rejects oversized responses before retaining them", async () => {
    const fetchMock = vi.fn(async () => graphResponse([{ value: "x".repeat(2000) }], [{ name: "value" }]));
    await expect(runHuntingQuery(authWithToken(), config, { query: "DeviceInfo" }, undefined, { fetch: fetchMock as typeof fetch, maxResponseBytes: 100 }))
      .rejects.toThrow("safety limit");
  });

  it("connectivity check returns metadata but not query data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => graphResponse([{ DeviceId: "sensitive" }], [{ name: "DeviceId" }])));
    expect(await testAdvancedHuntingConnectivity(authWithToken(), config)).toEqual({ ok: true, httpStatus: 200, resultRows: 1, schemaColumns: 1 });
  });
});
