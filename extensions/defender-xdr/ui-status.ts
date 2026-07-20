import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CommandRuntime } from "./commands/types.js";

const STATUS_ID = "defender-xdr-auth";

export async function refreshAuthStatus(ctx: ExtensionContext, runtime: CommandRuntime): Promise<void> {
  try {
    const accounts = await (await runtime.getAuth()).accounts();
    if (accounts.length === 0) {
      setLoggedOut(ctx);
      return;
    }
    const label = accounts.length === 1
      ? accounts[0]!.username || "signed in"
      : `${accounts.length} accounts`;
    ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("success", `XDR: ${label}`));
  } catch {
    // Missing/invalid configuration and unavailable credential stores should not disrupt pi startup.
    setLoggedOut(ctx);
  }
}

export function setLoggedInStatus(ctx: ExtensionContext, username?: string): void {
  ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("success", `XDR: ${username || "signed in"}`));
}

export function setLoggedOut(ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("muted", "XDR: logged out"));
}
