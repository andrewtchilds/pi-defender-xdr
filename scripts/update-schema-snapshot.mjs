#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "MicrosoftDocs/defender-docs";
const branch = "public";
const basePath = "defender-xdr";
const indexName = "advanced-hunting-schema-tables.md";
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), "../schema-snapshot/defender-xdr-schema.json");

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "pi-defender-xdr-schema-generator" } });
  if (!response.ok) throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

const commits = JSON.parse(await fetchText(`https://api.github.com/repos/${repository}/commits?sha=${branch}&path=${basePath}/${indexName}&per_page=1`));
const commit = commits[0]?.sha;
if (!commit) throw new Error("Unable to resolve the official documentation commit");
const rawBase = `https://raw.githubusercontent.com/${repository}/${commit}/${basePath}`;
const indexMarkdown = await fetchText(`${rawBase}/${indexName}`);
const sourceDate = /^ms\.date:\s*(.+)$/m.exec(indexMarkdown)?.[1]?.trim();

const tablePattern = /^\|\s*\*\*\[([^\]]+)]\((advanced-hunting-[^)]+-table\.md)\)\*\*\s*(\(Preview\))?\s*\|\s*(.*?)\s*\|\s*$/gm;
const entries = [];
for (const match of indexMarkdown.matchAll(tablePattern)) {
  entries.push({ name: match[1], document: match[2].toLowerCase(), preview: !!match[3], description: cleanMarkdown(match[4]) });
}
if (!entries.length) throw new Error("No schema table entries were found in the official index");

const tables = await mapConcurrent(entries, 8, async (entry) => {
  const markdown = await fetchText(`${rawBase}/${entry.document}`);
  const columns = parseColumns(markdown);
  if (!columns.length) throw new Error(`No columns found for ${entry.name} in ${entry.document}`);
  return {
    name: entry.name,
    description: entry.description,
    preview: entry.preview,
    columns,
    documentationUrl: `https://learn.microsoft.com/en-us/defender-xdr/${entry.document.replace(/\.md$/, "")}`,
  };
});

tables.sort((a, b) => a.name.localeCompare(b.name));
const retirementOverrides = {
  AADSignInEventsBeta: { status: "retired", replacedBy: "EntraIdSignInEvents", retirementDate: "2025-12-09" },
  AADSpnSignInEventsBeta: { status: "retired", replacedBy: "EntraIdSpnSignInEvents", retirementDate: "2025-12-09" },
  AIAgentsInfo: { status: "retired", replacedBy: "AgentsInfo", retirementDate: "2026-07-01" },
};
for (const table of tables) Object.assign(table, retirementOverrides[table.name] ?? { status: table.preview ? "preview" : "active" });

const snapshot = {
  schemaVersion: 1,
  source: "Microsoft Defender XDR official documentation",
  sourceUrl: "https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-schema-tables",
  sourceRepository: `https://github.com/${repository}`,
  sourceCommit: commit,
  sourceDate: sourceDate ?? null,
  schemaChangesUrl: "https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-schema-changes",
  tables,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Wrote ${tables.length} tables and ${tables.reduce((sum, table) => sum + table.columns.length, 0)} columns to ${outputPath}`);

function parseColumns(markdown) {
  const lines = markdown.split(/\r?\n/);
  const header = lines.findIndex((line) => /^\|\s*(?:Column name|Column)\s*\|\s*Data type\s*\|\s*Description\s*\|/i.test(line));
  if (header < 0) return [];
  const columns = [];
  for (let index = header + 2; index < lines.length && /^\s*\|/.test(lines[index]); index += 1) {
    const cells = splitMarkdownRow(lines[index]);
    if (cells.length < 3) continue;
    const name = cleanMarkdown(cells[0]);
    const type = cleanMarkdown(cells[1]);
    const description = cleanMarkdown(cells.slice(2).join(" | "));
    if (name) columns.push({ name, type, description });
  }
  return columns;
}

function splitMarkdownRow(line) {
  const cells = [];
  let current = "";
  let escaped = false;
  for (const character of line.trim().replace(/^\|/, "").replace(/\|$/, "")) {
    if (escaped) { current += character; escaped = false; continue; }
    if (character === "\\") { escaped = true; current += character; continue; }
    if (character === "|") { cells.push(current.trim()); current = ""; continue; }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

function cleanMarkdown(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\\\|/g, "|")
    .replace(/\s+/g, " ")
    .trim();
}

async function mapConcurrent(values, concurrency, mapper) {
  const output = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      output[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}
