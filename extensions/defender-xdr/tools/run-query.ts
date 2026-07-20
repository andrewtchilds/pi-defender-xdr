import { randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { runHuntingQuery } from "../client.js";
import { getXdrDirectory } from "../config.js";
import type { CommandRuntime } from "../commands/types.js";

const OUTPUT_NOTICE_RESERVE = 512;

const RunQueryParameters = Type.Object({
  query: Type.String({ description: "A read-only KQL Advanced Hunting query" }),
  timespan: Type.Optional(Type.String({ description: "Query timespan, for example 7d, 24h, P7D, or PT24H. Defaults to configured lookback." })),
  max_rows: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000, description: "Maximum rows returned to the model; cannot exceed configured maximumRows." })),
  export_results: Type.Optional(Type.Boolean({ description: "Write the complete result to an owner-only local JSON file. Use only when the user explicitly asks to save/export results." })),
});

interface RunQueryDetails {
  totalRows: number;
  displayedRows: number;
  schemaColumns: number;
  rowsTruncated: boolean;
  outputTruncated: boolean;
  exportPath?: string;
}

export function registerRunQueryTool(pi: ExtensionAPI, runtime: CommandRuntime): void {
  pi.registerTool({
    name: "xdr_run_query",
    label: "Defender XDR hunting query",
    description: `Run a read-only KQL query against Microsoft Defender XDR through Microsoft Graph. Browser login is never started; if authentication is required, tell the user to run /xdr-login. Output is bounded to the configured row limit, ${DEFAULT_MAX_LINES} lines, and ${DEFAULT_MAX_BYTES} bytes.`,
    promptSnippet: "Run read-only Microsoft Defender XDR Advanced Hunting KQL queries",
    promptGuidelines: [
      "Use xdr_run_query only for read-only Defender XDR investigation queries.",
      "Keep timespans and projected columns as narrow as practical; never set export_results unless the user explicitly requests a local export.",
    ],
    parameters: RunQueryParameters,

    async execute(_toolCallId, params, signal) {
      const [config, auth] = await Promise.all([runtime.getConfig(), runtime.getAuth()]);
      const result = await runHuntingQuery(auth, config, {
        query: params.query,
        timespan: params.timespan ?? config.defaultLookback,
      }, signal);

      const maximumRows = Math.min(params.max_rows ?? config.maximumRows, config.maximumRows);
      const displayedResults = result.results.slice(0, maximumRows).map(stripODataTypeAnnotations);
      const rowsTruncated = displayedResults.length < result.results.length;
      const payload = {
        totalRows: result.results.length,
        displayedRows: displayedResults.length,
        rowsTruncated,
        ...(displayedResults.length === 0 ? { schema: result.schema } : {}),
        results: displayedResults,
      };

      let exportPath: string | undefined;
      if (params.export_results) exportPath = await exportHuntingResult(result);

      const serialized = JSON.stringify(payload);
      const truncation = truncateHead(serialized, {
        maxLines: DEFAULT_MAX_LINES - 4,
        maxBytes: DEFAULT_MAX_BYTES - OUTPUT_NOTICE_RESERVE,
      });
      let text = truncation.content;
      if (truncation.truncated) {
        text += `\n\n[Output truncated to ${truncation.outputLines}/${truncation.totalLines} lines and ${truncation.outputBytes}/${truncation.totalBytes} bytes. Refine the query or explicitly request export_results.]`;
      }
      if (exportPath) text += `\n\n[Complete owner-only result exported to ${exportPath}]`;

      const details: RunQueryDetails = {
        totalRows: result.results.length,
        displayedRows: displayedResults.length,
        schemaColumns: result.schema.length,
        rowsTruncated,
        outputTruncated: truncation.truncated,
        ...(exportPath ? { exportPath } : {}),
      };
      return { content: [{ type: "text", text }], details };
    },
  });
}

export function stripODataTypeAnnotations(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([name]) => !name.endsWith("@odata.type")));
}

export async function exportHuntingResult(
  result: Awaited<ReturnType<typeof runHuntingQuery>>,
  baseDirectory = getXdrDirectory(),
): Promise<string> {
  const directory = join(baseDirectory, "exports");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `hunting-${timestamp}-${randomUUID()}.json`);
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(path, 0o600);
  return path;
}
