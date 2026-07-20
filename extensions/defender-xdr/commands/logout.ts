import { refreshAuthStatus } from "../ui-status.js";
import type { RegisterCommand } from "./types.js";

export const registerLogoutCommand: RegisterCommand = (pi, runtime) => {
  pi.registerCommand("xdr-logout", {
    description: "Remove a Defender XDR account and its cached credentials",
    handler: async (_args, ctx) => {
      const auth = await runtime.getAuth();
      const accounts = await auth.accounts();
      if (!accounts.length) {
        ctx.ui.notify("No Defender XDR account is cached.", "info");
        return;
      }
      let account = accounts[0]!;
      if (accounts.length > 1) {
        if (!ctx.hasUI) throw new Error("Multiple cached accounts require interactive selection");
        const choices = accounts.map((candidate) => `${candidate.username} — ${candidate.tenantId}`);
        const selected = await ctx.ui.select("Account to remove", choices);
        if (!selected) return;
        account = accounts[choices.indexOf(selected)]!;
      }
      const username = account.username || "(unknown account)";
      await auth.logout(account);
      await refreshAuthStatus(ctx, runtime);
      ctx.ui.notify(`Removed cached Defender XDR credentials for ${username}.`, "info");
    },
  });
};
