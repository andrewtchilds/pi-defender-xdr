import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from "@azure/msal-node";
import open from "open";
import { buildAuthority, buildScopes, GRAPH_CLOUDS, type XdrConfig } from "./config.js";
import { createPersistentCache, type PersistentCache } from "./cache.js";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Interactive authentication is required. Run /xdr-login; tools never open a browser automatically.");
    this.name = "AuthenticationRequiredError";
  }
}

interface TokenClaims {
  aud?: unknown;
  scp?: unknown;
  tid?: unknown;
}

function decodeClaims(accessToken: string): TokenClaims {
  const payload = accessToken.split(".")[1];
  if (!payload) throw new Error("Microsoft returned an access token with an unexpected format");
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
  } catch {
    throw new Error("Microsoft returned an access token with unreadable claims");
  }
}

export function verifyDefenderToken(accessToken: string, config: Pick<XdrConfig, "apiBaseUrl" | "tenantId">): void {
  const claims = decodeClaims(accessToken);
  const expectedAudience = config.apiBaseUrl.replace(/\/+$/, "").toLowerCase();
  const audience = typeof claims.aud === "string" ? claims.aud.replace(/\/+$/, "").toLowerCase() : "";
  const acceptedAudiences = new Set([expectedAudience]);
  if (GRAPH_CLOUDS.has(expectedAudience)) {
    acceptedAudiences.add("00000003-0000-0000-c000-000000000000");
  }
  if (!acceptedAudiences.has(audience)) throw new Error(`Token audience is not the configured hunting API (${config.apiBaseUrl})`);
  const scopes = typeof claims.scp === "string" ? claims.scp.split(/\s+/) : [];
  if (!scopes.some((scope) => scope.toLowerCase() === "threathunting.read.all")) {
    throw new Error("Token is missing the delegated ThreatHunting.Read.All scope");
  }
  if (typeof claims.tid !== "string" || claims.tid.toLowerCase() !== config.tenantId.toLowerCase()) {
    throw new Error("Token tenant does not match the configured tenant");
  }
}

export class XdrAuth {
  readonly pca: PublicClientApplication;
  readonly cache: PersistentCache;

  private constructor(
    readonly config: XdrConfig,
    cache: PersistentCache,
    pca: PublicClientApplication,
  ) {
    this.cache = cache;
    this.pca = pca;
  }

  static async create(config: XdrConfig, options: { cacheDirectory?: string } = {}): Promise<XdrAuth> {
    const cache = await createPersistentCache({
      ...(options.cacheDirectory ? { directory: options.cacheDirectory } : {}),
      allowUnencryptedFallback: config.allowUnencryptedTokenCache,
    });
    const pca = new PublicClientApplication({
      auth: { clientId: config.clientId, authority: buildAuthority(config) },
      cache: { cachePlugin: cache.cachePlugin },
      system: {
        loggerOptions: {
          piiLoggingEnabled: false,
          loggerCallback: () => undefined,
        },
      },
    });
    return new XdrAuth(config, cache, pca);
  }

  async accounts(): Promise<AccountInfo[]> {
    return this.pca.getAllAccounts();
  }

  private async account(homeAccountId?: string): Promise<AccountInfo | undefined> {
    const accounts = await this.accounts();
    if (homeAccountId) return accounts.find((candidate) => candidate.homeAccountId === homeAccountId);
    if (accounts.length > 1) throw new Error("Multiple Defender XDR accounts are cached; select one with /xdr-login");
    return accounts[0];
  }

  async acquireTokenSilent(homeAccountId?: string): Promise<AuthenticationResult> {
    const account = await this.account(homeAccountId);
    if (!account) throw new AuthenticationRequiredError();
    try {
      const result = await this.pca.acquireTokenSilent({ account, scopes: buildScopes(this.config) });
      verifyDefenderToken(result.accessToken, this.config);
      return result;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError || isInteractionRequired(error)) throw new AuthenticationRequiredError();
      throw sanitizeAuthError(error);
    }
  }

  async login(homeAccountId?: string, forceInteractive = false): Promise<AuthenticationResult> {
    const account = forceInteractive ? undefined : await this.account(homeAccountId);
    if (account) {
      try {
        return await this.acquireTokenSilent(account.homeAccountId);
      } catch (error) {
        if (!(error instanceof AuthenticationRequiredError)) throw error;
      }
    }

    const result = await this.pca.acquireTokenInteractive({
      scopes: buildScopes(this.config),
      ...(account ? { account } : {}),
      openBrowser: async (url) => {
        await open(url, { wait: false });
      },
      successTemplate: "Authentication complete. You can close this window and return to pi.",
      errorTemplate: "Authentication failed. Close this window and return to pi for details.",
    });
    verifyDefenderToken(result.accessToken, this.config);
    return result;
  }

  async logout(account: AccountInfo): Promise<void> {
    await this.pca.signOut({ account });
  }

}

function isInteractionRequired(error: unknown): boolean {
  return !!error && typeof error === "object" && "errorCode" in error &&
    ["interaction_required", "consent_required", "login_required"].includes(String((error as { errorCode: unknown }).errorCode));
}

function sanitizeAuthError(error: unknown): Error {
  const source = error instanceof Error ? error : new Error(String(error));
  const message = source.message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(?:access|refresh|id)[_-]?token\s*[:=]\s*\S+/gi, "token=[REDACTED]");
  return new Error(`Defender XDR authentication failed: ${message}`);
}
