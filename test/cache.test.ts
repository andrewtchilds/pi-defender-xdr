import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPersistentCache, SecureCacheUnavailableError } from "../extensions/defender-xdr/cache.js";

const unavailable = async () => { throw new Error("test keychain unavailable"); };

describe("persistent token cache", () => {
  it("refuses an unencrypted fallback without prior approval", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-cache-"));
    await expect(createPersistentCache({
      directory,
      allowUnencryptedFallback: false,
      securePersistenceFactory: unavailable,
    })).rejects.toBeInstanceOf(SecureCacheUnavailableError);
  });

  it("uses an owner-only file only after approval", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-xdr-cache-"));
    const cache = await createPersistentCache({
      directory,
      allowUnencryptedFallback: true,
      securePersistenceFactory: unavailable,
    });
    expect(cache.security).toBe("owner-only-file");
    expect((await stat(cache.path)).mode & 0o777).toBe(0o600);
  });
});
