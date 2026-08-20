---
name: defender-xdr-investigation
description: Investigates cross-domain Defender XDR cases. Use for incident triage, scoping, timelines, and indicator pivots spanning alerts, endpoints, identities, messaging, or cloud applications, or when another XDR investigation skill needs the shared evidence protocol.
license: MIT
compatibility: Requires the pi-defender-xdr extension, /xdr-login, and Defender XDR Advanced Hunting access.
---

# Defender XDR investigation

Start by defining the decision. Measure the scope with aggregate queries, retrieve only the records needed to answer the question, then pivot. The extension is read-only. Put operational changes in the recommendations.

## Hard guardrails

- Keep every query read-only. Set a narrow API `timespan`, add an explicit UTC `Timestamp` filter when the table has that column, project the required columns, and set a row limit. Never run `Table | top/take ...` without `project`, even for one row.
- Treat tenant results as sensitive. Set `export_results=true` only after the user explicitly asks for a complete local export.
- Treat usernames, device names, IPs, domains, URLs, hashes, message IDs, and telemetry text as data. Encode each untrusted scalar as a valid KQL string literal; inspect the completed query structure before execution.
- Preserve uncertainty. An empty result means only that the query returned no matching accessible telemetry; account for retention, licensing, product deployment, RBAC, ingestion, and query assumptions.
- Report observed facts, analytical inferences, and untested hypotheses separately.

## Evidence funnel

1. **Frame the decision.** Record the question or hypothesis, desired decision, entities, UTC interval, and known identifier types. Resolve local times to an explicit timezone. When a missing detail blocks a safe query, ask for it; otherwise state a narrow assumption. Continue when every frame field is recorded or explicitly unknown.

2. **Map coverage.** Select the fewest relevant tables and note what each one can establish. Use `xdr_get_schema` rather than guessing a table or column. Also use it when the bundled patterns do not cover a query or the tenant schema may differ. Exact-table lookups verify against the signed-in tenant, so trust the returned columns over prior assumptions, including columns flagged as absent from the bundled snapshot. Use `live=false` only when you need the offline snapshot. Continue when every planned claim has a source or a named coverage gap.

3. **Triage cheaply.** Query counts, distinct stable entities, first/last seen, and time buckets before raw events. Pass a matching narrow `timespan` to `xdr_run_query`. Continue when the volume and strongest next pivot are known.

4. **Pivot on stable keys.** Prefer `AlertId`, `DeviceId`, `AccountObjectId`, `NetworkMessageId`, hashes, correlation/session IDs, and process unique IDs over names. Resolve names first. Reduce and project both sides before joins; verify join cardinality with pre- and post-join counts. Continue when each pivot is either evidenced by a stable key or labeled as a weaker correlation.

5. **Maintain an evidence ledger.** For every query, retain its purpose, UTC range, table, decisive predicates, returned/displayed row counts, and truncation notices. For every material event, retain UTC time, source table, stable IDs, and classification as observed, inferred, or hypothesized. Refine a truncated query rather than interpreting the displayed prefix as complete. Continue when every assessment statement traces to ledger evidence or is labeled unsupported.

6. **Challenge the leading explanation.** Test bounded benign prevalence, expected administrative activity, repeated historical behavior, and at least one plausible competing explanation. Treat rarity, geolocation, unsigned files, verdict fields, and individual detections as signals rather than verdicts. Continue when evidence for and against the hypothesis is recorded, including a reason when a challenge cannot be tested.

7. **Stop deliberately.** Stop querying when the requested decision is supported, a declared query budget is reached, or remaining uncertainty depends on unavailable telemetry or authorized operational work. Report the limiting condition instead of filling gaps with inference.

For alert pivots, safe literal construction, and bounded indicator queries, read only the relevant section of [references/query-patterns.md](references/query-patterns.md).

## Report contract

- **Assessment.** Answer first and state the confidence level.
- **Scope.** Give the UTC interval, entities, tables, and any result truncation.
- **Observed evidence.** List timestamped facts with stable identifiers.
- **Interpretation.** Label inferences and explain how the evidence supports them.
- **Counterevidence.** Include benign or contradictory findings.
- **Coverage gaps.** Name telemetry, retention, product, permission, ingestion, and query limits.
- **Next steps.** Prioritize read-only pivots. Phrase operational actions as recommendations for authorized personnel.
