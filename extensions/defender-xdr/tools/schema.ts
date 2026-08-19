import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CommandRuntime } from "../commands/types.js";
import { findSchemaTable, getLiveTableColumns, loadSchemaSnapshot, searchSchema } from "../schema.js";

const SchemaParameters = Type.Object({
  table: Type.Optional(Type.String({ description: "Exact Defender XDR table name to describe" })),
  search: Type.Optional(Type.String({ description: "Search table names, table descriptions, column names, and column descriptions" })),
  live: Type.Optional(Type.Boolean({ description: "Verify an exact table's columns against the signed-in tenant (take-0 query, TTL-cached). Defaults to true for exact-table lookups so tenant-specific and newly added columns surface automatically; set false for the offline bundled snapshot only." })),
  refresh: Type.Optional(Type.Boolean({ description: "Bypass the live schema TTL cache and refetch; valid only with an exact table and not with live=false." })),
  include_retired: Type.Optional(Type.Boolean({ description: "Include tables marked retired by Microsoft's schema-change documentation" })),
  verbose: Type.Optional(Type.Boolean({ description: "Include documentation URLs and full column descriptions. Defaults to compact names and types." })),
});

export function registerSchemaTool(pi: ExtensionAPI, runtime: CommandRuntime): void {
  pi.registerTool({
    name: "xdr_get_schema",
    label: "Defender XDR schema",
    description: "List, search, or describe Microsoft Defender XDR Advanced Hunting tables and columns from a bundled official-documentation snapshot. Exact-table lookups are verified against the signed-in tenant by default (TTL-cached), so tenant-specific and newly added columns surface automatically; pass live=false for the offline bundled view. Does not expose tenant event data.",
    promptSnippet: "Look up Defender XDR Advanced Hunting tables and columns",
    promptGuidelines: [
      "Use xdr_get_schema before guessing Defender XDR table or column names.",
      "Prefer active tables over retired replacements; exact-table lookups auto-verify against the tenant, so trust the returned columns (including any marked as not in the bundled snapshot) over prior assumptions about what does or does not exist.",
    ],
    parameters: SchemaParameters,

    async execute(_toolCallId, params, signal) {
      if (params.table && params.search) throw new Error("Specify either table or search, not both");
      if ((params.live || params.refresh) && !params.table) throw new Error("live and refresh require an exact table");
      if (params.refresh && params.live === false) throw new Error("refresh cannot be combined with live=false");

      const snapshot = await loadSchemaSnapshot();
      let payload: unknown;
      if (params.table) {
        const table = await findSchemaTable(params.table);
        if (!table) {
          const suggestions = searchSchema(snapshot, params.table, true, 5).map((match) => match.table);
          throw new Error(`Unknown Defender XDR table ${JSON.stringify(params.table)}${suggestions.length ? `; possible matches: ${suggestions.join(", ")}` : ""}`);
        }
        if (table.status === "retired" && !params.include_retired) {
          throw new Error(`${table.name} retired on ${table.retirementDate ?? "an unspecified date"}${table.replacedBy ? `; use ${table.replacedBy}` : ""}`);
        }

        const verbose = params.verbose ?? false;
        const tablePayload = {
          name: table.name,
          description: table.description,
          status: table.status,
          ...(table.replacedBy ? { replacedBy: table.replacedBy, retirementDate: table.retirementDate } : {}),
          ...(verbose ? { documentationUrl: table.documentationUrl } : {}),
          columns: table.columns.map((column) => verbose ? column : { name: column.name, type: column.type }),
        };
        payload = tablePayload;
        const wantsLive = params.live ?? true;
        if (wantsLive) {
          try {
            const live = await getLiveTableColumns(table, runtime, signal, params.refresh ?? false);
            const documentedByName = new Map(table.columns.map((column) => [column.name.toLowerCase(), column]));
            const liveNames = new Set(live.columns.map((column) => column.name.toLowerCase()));
            payload = {
              ...tablePayload,
              columns: live.columns.map((column) => verbose ? {
                ...column,
                description: documentedByName.get(column.name.toLowerCase())?.description ?? "Not present in the bundled documentation snapshot",
              } : column),
              documentedOnlyColumns: table.columns.filter((column) => !liveNames.has(column.name.toLowerCase())).map((column) => column.name),
              liveVerification: { fetchedAt: live.fetchedAt, cached: live.cached },
            };
          } catch (error) {
            if (signal?.aborted) throw error;
            payload = {
              ...tablePayload,
              liveVerification: {
                status: "failed",
                error: (error as Error).message,
                note: "Live tenant verification failed; columns are from the bundled documentation snapshot and may be incomplete.",
              },
            };
          }
        }
      } else if (params.search) {
        payload = {
          search: params.search,
          matches: searchSchema(snapshot, params.search, params.include_retired ?? false),
          sourceDate: snapshot.sourceDate,
        };
      } else {
        const tables = snapshot.tables
          .filter((table) => params.include_retired || table.status !== "retired")
          .map(({ name, description, status, replacedBy }) => ({ name, description, status, ...(replacedBy ? { replacedBy } : {}) }));
        payload = { tables, sourceDate: snapshot.sourceDate, sourceUrl: snapshot.sourceUrl, schemaChangesUrl: snapshot.schemaChangesUrl };
      }

      const text = boundedJson(payload);
      return {
        content: [{ type: "text", text }],
        details: { sourceCommit: snapshot.sourceCommit, sourceDate: snapshot.sourceDate },
      };
    },
  });
}

function boundedJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  const result = truncateHead(serialized, { maxLines: DEFAULT_MAX_LINES - 3, maxBytes: DEFAULT_MAX_BYTES - 300 });
  return result.truncated
    ? `${result.content}\n\n[Schema output truncated: narrow the table or search term.]`
    : result.content;
}
