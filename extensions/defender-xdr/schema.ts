import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runHuntingQuery, type HuntingColumn } from "./client.js";
import type { CommandRuntime } from "./commands/types.js";
import { getXdrDirectory, saveStoredConfig } from "./config.js";

export interface SchemaColumn {
  name: string;
  type: string;
  description: string;
}

export interface SchemaTable {
  name: string;
  description: string;
  preview: boolean;
  status: "active" | "preview" | "retired";
  replacedBy?: string;
  retirementDate?: string;
  columns: SchemaColumn[];
  documentationUrl: string;
}

export interface SchemaSnapshot {
  schemaVersion: number;
  source: string;
  sourceUrl: string;
  sourceRepository: string;
  sourceCommit: string;
  sourceDate: string | null;
  schemaChangesUrl: string;
  tables: SchemaTable[];
}

interface CachedTable {
  fetchedAt: string;
  columns: HuntingColumn[];
}

interface SchemaCache {
  version: 1;
  tables: Record<string, CachedTable>;
}

let snapshotPromise: Promise<SchemaSnapshot> | undefined;

export function loadSchemaSnapshot(): Promise<SchemaSnapshot> {
  snapshotPromise ??= readFile(new URL("../../schema-snapshot/defender-xdr-schema.json", import.meta.url), "utf8")
    .then((text) => validateSnapshot(JSON.parse(text) as unknown));
  return snapshotPromise;
}

export async function findSchemaTable(name: string): Promise<SchemaTable | undefined> {
  const normalized = name.trim().toLowerCase();
  return (await loadSchemaSnapshot()).tables.find((table) => table.name.toLowerCase() === normalized);
}

export async function getLiveTableColumns(
  table: SchemaTable,
  runtime: CommandRuntime,
  signal?: globalThis.AbortSignal,
  refresh = false,
  cachePath = join(getXdrDirectory(), "schema-cache.json"),
): Promise<{ columns: HuntingColumn[]; fetchedAt: string; cached: boolean }> {
  const config = await runtime.getConfig();
  const key = table.name.toLowerCase();
  const path = cachePath;
  const cache = await readSchemaCache(path);
  const existing = cache.tables[key];
  const ttlMilliseconds = config.schemaTtlHours * 60 * 60 * 1000;
  if (!refresh && existing && Date.now() - Date.parse(existing.fetchedAt) < ttlMilliseconds) {
    return { ...existing, cached: true };
  }

  const auth = await runtime.getAuth();
  const result = await runHuntingQuery(auth, config, { query: `${table.name}\n| take 0`, timespan: config.defaultLookback }, signal);
  const fetchedAt = new Date().toISOString();
  cache.tables[key] = { fetchedAt, columns: result.schema };
  await saveStoredConfig(cache, path);
  return { columns: result.schema, fetchedAt, cached: false };
}

export function searchSchema(snapshot: SchemaSnapshot, term: string, includeRetired = false, limit = 20): Array<{
  table: string;
  tableDescription: string;
  status: SchemaTable["status"];
  matchingColumns: Array<Pick<SchemaColumn, "name" | "type" | "description">>;
}> {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  const matches = [];
  for (const table of snapshot.tables) {
    if (!includeRetired && table.status === "retired") continue;
    const tableMatches = `${table.name} ${table.description}`.toLowerCase().includes(needle);
    const matchingColumns = table.columns.filter((column) => `${column.name} ${column.description}`.toLowerCase().includes(needle)).slice(0, 20);
    if (tableMatches || matchingColumns.length) {
      matches.push({ table: table.name, tableDescription: table.description, status: table.status, matchingColumns });
    }
  }
  return matches.slice(0, limit);
}

async function readSchemaCache(path: string): Promise<SchemaCache> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1 || !(value as { tables?: unknown }).tables || typeof (value as { tables: unknown }).tables !== "object") {
      return { version: 1, tables: {} };
    }
    return value as SchemaCache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return { version: 1, tables: {} };
    throw new Error(`Unable to read Defender XDR schema cache: ${(error as Error).message}`);
  }
}

function validateSnapshot(value: unknown): SchemaSnapshot {
  if (!value || typeof value !== "object" || !Array.isArray((value as { tables?: unknown }).tables)) {
    throw new Error("Bundled Defender XDR schema snapshot is invalid");
  }
  return value as SchemaSnapshot;
}
