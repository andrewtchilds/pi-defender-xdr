import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { XdrAuth } from "../auth.js";
import type { XdrConfig } from "../config.js";

export interface CommandRuntime {
  getConfig(): Promise<XdrConfig>;
  getAuth(): Promise<XdrAuth>;
  reset(): void;
}

export type RegisterCommand = (pi: ExtensionAPI, runtime: CommandRuntime) => void;
export type CommandContext = ExtensionCommandContext;
