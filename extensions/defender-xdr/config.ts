import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const GRAPH_CLOUDS: ReadonlyMap<string, string> = new Map([
  ["https://graph.microsoft.com", "https://login.microsoftonline.com"],
  ["https://graph.microsoft.us", "https://login.microsoftonline.us"],
  ["https://microsoftgraph.chinacloudapi.cn", "https://login.chinacloudapi.cn"],
] as const);

export const DEFAULT_CONFIG = {
  authorityHost: "https://login.microsoftonline.com",
  apiBaseUrl: "https://graph.microsoft.com",
  redirectUri: "http://localhost",
  defaultLookback: "7d",
  maximumRows: 1000,
  schemaTtlHours: 168,
  scopeMode: "delegated" as const,
  allowUnencryptedTokenCache: false,
};

export type ScopeMode = "delegated" | "default";

export interface XdrConfig {
  tenantId: string;
  clientId: string;
  authorityHost: string;
  apiBaseUrl: string;
  redirectUri: string;
  defaultLookback: string;
  maximumRows: number;
  schemaTtlHours: number;
  scopeMode: ScopeMode;
  allowUnencryptedTokenCache: boolean;
}

export interface ConfigEnvironment {
  PI_XDR_TENANT_ID?: string;
  PI_XDR_CLIENT_ID?: string;
  PI_XDR_API_BASE_URL?: string;
  PI_XDR_AUTHORITY_HOST?: string;
}

export function getXdrDirectory(): string {
  return join(getAgentDir(), "defender-xdr");
}

export function getConfigPath(): string {
  return join(getXdrDirectory(), "config.json");
}

export function buildAuthority(config: Pick<XdrConfig, "authorityHost" | "tenantId">): string {
  return `${config.authorityHost.replace(/\/+$/, "")}/${config.tenantId}`;
}

export function buildScopes(config: Pick<XdrConfig, "apiBaseUrl" | "scopeMode">): string[] {
  const resource = config.apiBaseUrl.replace(/\/+$/, "");
  return [config.scopeMode === "default" ? `${resource}/.default` : `${resource}/ThreatHunting.Read.All`];
}

function requireGuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a GUID`);
  }
  return value;
}

function requireHttpsUrl(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be an HTTPS URL`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a plain HTTPS URL`);
  }
  return url.toString().replace(/\/$/, "");
}

export function validateConfig(input: unknown): XdrConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Configuration must be a JSON object");
  const value = input as Record<string, unknown>;
  if ("clientSecret" in value || "client_secret" in value) throw new Error("Client secrets are not supported");

  const redirectUri = value.redirectUri;
  if (redirectUri !== "http://localhost") throw new Error('redirectUri must be "http://localhost" for the public-client loopback flow');
  if (typeof value.defaultLookback !== "string" || !/^\d+[dh]$/.test(value.defaultLookback)) {
    throw new Error("defaultLookback must be a duration such as 7d or 24h");
  }
  const maximumRows = value.maximumRows;
  if (!Number.isInteger(maximumRows) || (maximumRows as number) < 1 || (maximumRows as number) > 10_000) {
    throw new Error("maximumRows must be an integer from 1 to 10000");
  }
  const schemaTtlHours = value.schemaTtlHours;
  if (!Number.isInteger(schemaTtlHours) || (schemaTtlHours as number) < 1) throw new Error("schemaTtlHours must be a positive integer");
  if (value.scopeMode !== "delegated" && value.scopeMode !== "default") throw new Error('scopeMode must be "delegated" or "default"');
  if (typeof value.allowUnencryptedTokenCache !== "boolean") throw new Error("allowUnencryptedTokenCache must be boolean");

  const authorityHost = requireHttpsUrl(value.authorityHost, "authorityHost");
  const apiBaseUrl = requireHttpsUrl(value.apiBaseUrl, "apiBaseUrl");
  const expectedAuthority = GRAPH_CLOUDS.get(apiBaseUrl);
  if (!expectedAuthority) throw new Error("apiBaseUrl must be an official Microsoft Graph cloud endpoint");
  if (authorityHost !== expectedAuthority) throw new Error(`authorityHost must be ${expectedAuthority} for ${apiBaseUrl}`);

  return {
    tenantId: requireGuid(value.tenantId, "tenantId"),
    clientId: requireGuid(value.clientId, "clientId"),
    authorityHost,
    apiBaseUrl,
    redirectUri,
    defaultLookback: value.defaultLookback,
    maximumRows: maximumRows as number,
    schemaTtlHours: schemaTtlHours as number,
    scopeMode: value.scopeMode,
    allowUnencryptedTokenCache: value.allowUnencryptedTokenCache,
  };
}

export async function readStoredConfig(path = getConfigPath()): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("must contain a JSON object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Unable to read Defender XDR config at ${path}: ${(error as Error).message}`);
  }
}

export async function loadConfig(options: { path?: string; env?: ConfigEnvironment } = {}): Promise<XdrConfig> {
  const stored = await readStoredConfig(options.path);
  const env = options.env ?? process.env;
  // Migrate Phase 1 prerelease configuration away from Microsoft's retiring endpoint.
  const migratedStored = stored.apiBaseUrl === "https://api.security.microsoft.com"
    ? { ...stored, apiBaseUrl: DEFAULT_CONFIG.apiBaseUrl }
    : stored;
  return validateConfig({
    ...DEFAULT_CONFIG,
    ...migratedStored,
    ...(env.PI_XDR_TENANT_ID ? { tenantId: env.PI_XDR_TENANT_ID } : {}),
    ...(env.PI_XDR_CLIENT_ID ? { clientId: env.PI_XDR_CLIENT_ID } : {}),
    ...(env.PI_XDR_API_BASE_URL ? { apiBaseUrl: env.PI_XDR_API_BASE_URL } : {}),
    ...(env.PI_XDR_AUTHORITY_HOST ? { authorityHost: env.PI_XDR_AUTHORITY_HOST } : {}),
  });
}

export async function saveStoredConfig(config: object, path = getConfigPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(temp, 0o600);
    await rename(temp, path);
  } finally {
    // Avoid leaving configuration (which can contain tenant identifiers) in a stale temp file.
    await rm(temp, { force: true }).catch(() => undefined);
  }
}
