import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { XdrAuth } from "./auth.js";
import { loadConfig, type XdrConfig } from "./config.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import type { CommandRuntime } from "./commands/types.js";
import { refreshAuthStatus } from "./ui-status.js";
import { registerRunQueryTool } from "./tools/run-query.js";
import { registerSchemaTool } from "./tools/schema.js";

export default function defenderXdrExtension(pi: ExtensionAPI): void {
  let configPromise: Promise<XdrConfig> | undefined;
  let authPromise: Promise<XdrAuth> | undefined;

  const runtime: CommandRuntime = {
    getConfig() {
      configPromise ??= loadConfig();
      return configPromise;
    },
    getAuth() {
      authPromise ??= runtime.getConfig().then((config) => XdrAuth.create(config));
      return authPromise;
    },
    reset() {
      configPromise = undefined;
      authPromise = undefined;
    },
  };

  registerLoginCommand(pi, runtime);
  registerLogoutCommand(pi, runtime);
  registerRunQueryTool(pi, runtime);
  registerSchemaTool(pi, runtime);

  pi.on("session_start", async (_event, ctx) => {
    await refreshAuthStatus(ctx, runtime);
  });
}
