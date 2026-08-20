---
name: defender-xdr-endpoint-investigation
description: Investigates Defender XDR endpoint activity. Use for malware, process trees, files, network connections, registry persistence, device logons, lateral movement, hashes, IPs, or host scoping.
license: MIT
compatibility: Requires the pi-defender-xdr extension, /xdr-login, and access to Defender for Endpoint hunting tables.
---

# Defender XDR endpoint investigation

Load and apply `defender-xdr-investigation` first. Its guardrails, query process, ledger, stop conditions, and report format apply here. This skill adds the endpoint-specific steps.

## Endpoint invariants

- Resolve hostnames to `DeviceId`; names can be reused, renamed, or duplicated. Preserve all candidates until time and telemetry disambiguate them.
- Prefer `ProcessUniqueId` and `InitiatingProcessUniqueId`. Where unavailable, correlate PIDs only on the same device and within process creation/lifetime constraints because PIDs are reused.
- SHA1 is often more populated than SHA256 in endpoint tables. Record hash type and value; a missing hash is a coverage gap rather than a benign signal.
- Expand `AdditionalFields` only for hypothesis-relevant keys.
- Distinguish connection attempts from successful sessions using `ActionType` and corroborating telemetry.

## Endpoint branch

1. **Anchor the device.** Resolve the supplied device name, ID, IP, or alert evidence against the investigation interval. Record onboarding/sensor state where available. Continue when one or more candidate `DeviceId` values are recorded and ambiguity is explicit.

2. **Build the process chain.** Identify the target process, its parent, children, account, command line, hash, creation time, integrity or elevation, and unique IDs. Search the smallest interval that captures the chain. Continue when each relationship has direct unique-ID evidence, a weaker time-constrained correlation, or a named telemetry gap.

3. **Query related telemetry.** Pivot only to network, file, image-load, registry, logon, or other device events that test the hypothesis. Keep the process and device keys, and use a tight causal interval. Continue when telemetry supports or contradicts each suspicious behavior, or record a coverage gap.

4. **Scope affected devices and accounts.** Aggregate strong hashes, destinations, accounts, or persistence artifacts across devices before retrieving records. Do not scope on weak strings such as a common filename unless stronger context accompanies them. Continue when the counts and first or last seen times are known within the chosen bounds.

5. **Test prevalence and administration context.** Compare the signer, company, path, historical device prevalence, software deployment, remote administration, and expected management tools. Public IPs may belong to proxies, CDNs, VPNs, or shared services. Rare or unsigned binaries and LOLBin use are leads, not verdicts. Continue after testing the strongest benign alternative or recording why the required source is unavailable.

6. **Return the endpoint ledger.** Emit ordered UTC events with `DeviceId`, process unique IDs, hashes, accounts, and source tables. Include clock/correlation tolerance where timestamps from different tables are linked.

Use `xdr_get_schema` when a pattern's columns are uncertain or tenant verification matters. For the table map and bounded process, network, hash, file, registry, and logon patterns, read only the relevant section of [references/query-patterns.md](references/query-patterns.md).
