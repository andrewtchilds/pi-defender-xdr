import {
  DataProtectionScope,
  FilePersistence,
  PersistenceCachePlugin,
  PersistenceCreator,
  type IPersistence,
} from "@azure/msal-node-extensions";
import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getXdrDirectory } from "./config.js";

export type CacheSecurity = "os-protected" | "owner-only-file";

export interface PersistentCache {
  cachePlugin: PersistenceCachePlugin;
  persistence: IPersistence;
  security: CacheSecurity;
  path: string;
}

export class SecureCacheUnavailableError extends Error {
  constructor(public readonly causeMessage: string) {
    super(
      "OS-backed secure token storage is unavailable. Run /xdr-login interactively to approve an owner-only unencrypted file cache, or fix the OS keychain/secret service.",
    );
    this.name = "SecureCacheUnavailableError";
  }
}

async function preparePath(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
}

export async function createPersistentCache(options: {
  directory?: string;
  allowUnencryptedFallback: boolean;
  /** Test seam; production always uses PersistenceCreator. */
  securePersistenceFactory?: (path: string) => Promise<IPersistence>;
}): Promise<PersistentCache> {
  const directory = options.directory ?? getXdrDirectory();
  const path = join(directory, "msal-cache.bin");
  await preparePath(path);

  try {
    const persistence = options.securePersistenceFactory
      ? await options.securePersistenceFactory(path)
      : await PersistenceCreator.createPersistence({
          cachePath: path,
          dataProtectionScope: DataProtectionScope.CurrentUser,
          serviceName: "pi-defender-xdr",
          accountName: "msal-token-cache",
          usePlaintextFileOnLinux: false,
        });
    if (!(await persistence.verifyPersistence())) throw new Error("secure persistence verification failed");
    // Keychain and LibSecret use this owner-only file only for locking/change detection.
    try {
      await chmod(path, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return { cachePlugin: new PersistenceCachePlugin(persistence), persistence, security: "os-protected", path };
  } catch (error) {
    if (!options.allowUnencryptedFallback) {
      throw new SecureCacheUnavailableError((error as Error).message);
    }
  }

  const fallbackPath = join(directory, "msal-cache.unencrypted.json");
  const persistence = await FilePersistence.create(fallbackPath);
  await chmod(fallbackPath, 0o600);
  if (!(await persistence.verifyPersistence())) throw new Error("Owner-only token cache verification failed");
  await chmod(fallbackPath, 0o600);
  return {
    cachePlugin: new PersistenceCachePlugin(persistence),
    persistence,
    security: "owner-only-file",
    path: fallbackPath,
  };
}
