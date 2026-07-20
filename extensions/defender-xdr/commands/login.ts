import { SecureCacheUnavailableError } from "../cache.js";
import {
  DEFAULT_CONFIG,
  getConfigPath,
  readStoredConfig,
  saveStoredConfig,
  validateConfig,
} from "../config.js";
import type { XdrAuth } from "../auth.js";
import { setLoggedInStatus } from "../ui-status.js";
import type { CommandContext, CommandRuntime, RegisterCommand } from "./types.js";

export const registerLoginCommand: RegisterCommand = (pi, runtime) => {
  pi.registerCommand("xdr-login", {
    description: "Sign in to Defender XDR in the system browser",
    handler: async (_args, ctx) => {
      if (!(await ensureConfigured(runtime, ctx))) return;

      let auth: XdrAuth;
      try {
        auth = await runtime.getAuth();
      } catch (error) {
        runtime.reset();
        if (!(error instanceof SecureCacheUnavailableError)) throw error;
        if (!ctx.hasUI) throw error;
        const approved = await ctx.ui.confirm(
          "Secure token storage unavailable",
          "The OS keychain/credential store could not be used. Store the MSAL cache unencrypted in an owner-only (0600) file instead? This file can contain refresh credentials. Choose No to fix the OS credential store.",
        );
        if (!approved) {
          ctx.ui.notify("Login cancelled; no unencrypted token cache was enabled.", "warning");
          return;
        }
        const config = await runtime.getConfig();
        await saveStoredConfig({ ...config, allowUnencryptedTokenCache: true });
        runtime.reset();
        auth = await runtime.getAuth();
      }

      const accounts = await auth.accounts();
      let homeAccountId: string | undefined;
      let forceInteractive = false;
      if (accounts.length > 1) {
        if (!ctx.hasUI) throw new Error("Multiple cached accounts require interactive selection");
        const choices = accounts.map((account) => `${account.username} — ${account.tenantId}`);
        const selected = await ctx.ui.select("Defender XDR account", [...choices, "Sign in with another account"]);
        if (!selected) return;
        const index = choices.indexOf(selected);
        if (index >= 0) homeAccountId = accounts[index]!.homeAccountId;
        else forceInteractive = true;
      }

      const result = await auth.login(homeAccountId, forceInteractive);
      setLoggedInStatus(ctx, result.account?.username);
      ctx.ui.notify(
        `Signed in as ${result.account?.username ?? "(unknown account)"} (tenant ${result.tenantId}). Token cache: ${auth.cache.security}.`,
        "info",
      );
    },
  });
};

async function ensureConfigured(runtime: CommandRuntime, ctx: CommandContext): Promise<boolean> {
  try {
    await runtime.getConfig();
    return true;
  } catch (originalError) {
    if (!ctx.hasUI) {
      throw new Error(`Defender XDR is not configured and /xdr-login requires an interactive UI: ${(originalError as Error).message}`);
    }

    const stored = await readStoredConfig();
    const tenantId = await ctx.ui.input("Defender XDR tenant ID", String(stored.tenantId ?? ""));
    if (!tenantId) {
      ctx.ui.notify("Defender XDR login cancelled; configuration was not saved.", "warning");
      return false;
    }
    const clientId = await ctx.ui.input("Existing Entra application/client ID", String(stored.clientId ?? ""));
    if (!clientId) {
      ctx.ui.notify("Defender XDR login cancelled; configuration was not saved.", "warning");
      return false;
    }

    const config = validateConfig({
      ...DEFAULT_CONFIG,
      ...stored,
      tenantId: tenantId.trim(),
      clientId: clientId.trim(),
    });
    await saveStoredConfig(config);
    runtime.reset();
    ctx.ui.notify(`Defender XDR configuration saved to ${getConfigPath()}. No client secret is used.`, "info");
    return true;
  }
}
