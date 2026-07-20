import type { XdrAuth } from "./auth.js";
import type { XdrConfig } from "./config.js";

export const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_RETRY_DELAY_MS = 30_000;

export interface HuntingColumn {
  name: string;
  type?: string;
  [key: string]: unknown;
}

export interface HuntingQueryResult {
  schema: HuntingColumn[];
  results: Record<string, unknown>[];
}

export interface RunHuntingQueryInput {
  query: string;
  timespan?: string;
}

export interface ConnectivityResult {
  ok: true;
  httpStatus: number;
  resultRows: number;
  schemaColumns: number;
}

export class XdrApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "XdrApiError";
  }
}

interface ClientOptions {
  fetch?: typeof fetch;
  maxRetries?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  maxResponseBytes?: number;
}

export async function runHuntingQuery(
  auth: XdrAuth,
  config: XdrConfig,
  input: RunHuntingQueryInput,
  signal?: AbortSignal,
  options: ClientOptions = {},
): Promise<HuntingQueryResult> {
  if (!input.query.trim()) throw new Error("Hunting query must not be empty");
  if (signal?.aborted) throw cancellationError();

  const token = await auth.acquireTokenSilent();
  const fetchImplementation = options.fetch ?? fetch;
  const maxRetries = options.maxRetries ?? 2;
  const sleep = options.sleep ?? abortableDelay;
  const url = `${config.apiBaseUrl}/v1.0/security/runHuntingQuery`;
  const body = JSON.stringify({ Query: input.query, ...(input.timespan ? { Timespan: normalizeTimespan(input.timespan) } : {}) });

  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImplementation(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          "content-type": "application/json; charset=utf-8",
        },
        body,
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw cancellationError();
      throw new Error(`Defender XDR request failed: ${sanitizeText(error instanceof Error ? error.message : String(error))}`);
    }

    const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
    if (response.status === 429 && attempt < maxRetries && retryAfterSeconds !== undefined && retryAfterSeconds * 1000 <= MAX_RETRY_DELAY_MS) {
      await response.body?.cancel();
      await sleep(retryAfterSeconds * 1000, signal);
      continue;
    }

    const parsed = await readJsonBody(response, options.maxResponseBytes ?? MAX_RESPONSE_BYTES, signal);
    if (!response.ok) throw apiError(response, parsed, retryAfterSeconds);
    return validateQueryResult(parsed);
  }
}

export async function testAdvancedHuntingConnectivity(
  auth: XdrAuth,
  config: XdrConfig,
  signal?: AbortSignal,
): Promise<ConnectivityResult> {
  const result = await runHuntingQuery(auth, config, { query: "DeviceInfo\n| take 1" }, signal);
  return {
    ok: true,
    httpStatus: 200,
    resultRows: result.results.length,
    schemaColumns: result.schema.length,
  };
}

export function normalizeTimespan(value: string): string {
  const trimmed = value.trim();
  const shorthand = /^(\d+)([dh])$/i.exec(trimmed);
  if (shorthand) return shorthand[2]?.toLowerCase() === "d" ? `P${shorthand[1]}D` : `PT${shorthand[1]}H`;
  if (/^P(?=\d|T\d)(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/i.test(trimmed)) return trimmed.toUpperCase();
  throw new Error("timespan must be a duration such as 7d, 24h, P7D, or PT24H");
}

function validateQueryResult(body: unknown): HuntingQueryResult {
  if (!body || typeof body !== "object") throw new Error("Microsoft Graph returned an invalid hunting response");
  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.schema) || !Array.isArray(value.results)) {
    throw new Error("Microsoft Graph hunting response is missing schema or results");
  }
  const schema = value.schema.filter((column): column is HuntingColumn => !!column && typeof column === "object" && typeof (column as HuntingColumn).name === "string");
  const results = value.results.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row));
  if (schema.length !== value.schema.length || results.length !== value.results.length) {
    throw new Error("Microsoft Graph hunting response contains invalid schema or result rows");
  }
  return { schema, results };
}

async function readJsonBody(response: Response, limit: number, signal?: AbortSignal): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw oversizedResponseError(limit);
  if (!response.body) return {};

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      if (signal?.aborted) throw cancellationError();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw oversizedResponseError(limit);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw cancellationError();
    throw error;
  } finally {
    reader.releaseLock();
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) return { message: text.slice(0, 4000) };
    throw new Error("Microsoft Graph returned malformed JSON");
  }
}

function apiError(response: Response, body: unknown, retryAfterSeconds?: number): XdrApiError {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const nested = value.error && typeof value.error === "object" ? value.error as Record<string, unknown> : undefined;
  const inner = nested?.innerError && typeof nested.innerError === "object" ? nested.innerError as Record<string, unknown> : undefined;
  const code = typeof nested?.code === "string" ? nested.code : undefined;
  const diagnostic = sanitizeText(String(nested?.message ?? value.message ?? `HTTP ${response.status}`));
  const requestId = response.headers.get("request-id") ?? (typeof inner?.["request-id"] === "string" ? inner["request-id"] : undefined);

  let prefix: string;
  switch (response.status) {
    case 400: prefix = "Invalid hunting query"; break;
    case 401: prefix = "Microsoft Graph rejected the access token; run /xdr-login"; break;
    case 403: prefix = "Access denied; verify delegated ThreatHunting.Read.All admin consent and the signed-in user's Defender RBAC"; break;
    case 429: prefix = `Defender XDR query throttled${retryAfterSeconds === undefined ? "" : `; retry after ${retryAfterSeconds}s`}`; break;
    default: prefix = "Defender XDR query failed";
  }
  const suffix = [diagnostic, code ? `code=${sanitizeText(code)}` : "", requestId ? `request-id=${sanitizeText(requestId)}` : ""].filter(Boolean).join("; ");
  return new XdrApiError(`${prefix} (${response.status}): ${suffix}`, response.status, code, retryAfterSeconds, requestId);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function sanitizeText(value: string): string {
  return value
    .slice(0, 4000)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(?:access|refresh|id)[_-]?token\s*[:=]\s*\S+/gi, "token=[REDACTED]");
}

function oversizedResponseError(limit: number): Error {
  return new Error(`Microsoft Graph hunting response exceeded the ${Math.floor(limit / (1024 * 1024))} MiB safety limit; narrow the query or timespan`);
}

function cancellationError(): Error {
  const error = new Error("Defender XDR query cancelled");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancellationError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancellationError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
