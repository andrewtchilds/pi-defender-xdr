---
name: defender-xdr-endpoint-investigation
description: Investigates Defender XDR endpoint processes, files, network, registry, logons, and process trees. Use for malware, lateral movement, persistence, device timelines, hashes, IPs, and host scoping.
license: MIT
compatibility: Requires the pi-defender-xdr extension, /xdr-login, and access to Defender for Endpoint hunting tables.
---

# Defender XDR Endpoint Investigation

Perform read-only, evidence-driven endpoint hunting. Follow the cross-domain `defender-xdr-investigation` skill when the case spans alerts, identity, or messaging.

## Rules

- Confirm columns with `xdr_get_schema`; endpoint schemas evolve and not every tenant exposes every table.
- Resolve a hostname to `DeviceId`. Names can be reused, renamed, or duplicated.
- Use UTC bounds in KQL and a matching narrow `timespan` in `xdr_run_query`.
- Begin with aggregates, then retrieve bounded raw records.
- Prefer `ProcessUniqueId` and `InitiatingProcessUniqueId`. If absent, correlate process IDs only on the same device with creation-time constraints because PIDs are reused.
- SHA1 is commonly more populated than SHA256 in Defender endpoint tables. Do not label a file benign merely because a hash is absent.
- Do not expand `AdditionalFields` unless needed, and project only the keys relevant to the hypothesis.
- Empty results indicate only that no matching accessible telemetry was returned.

## Table selection

Use `xdr_get_schema` to verify these likely pivots:

- `DeviceInfo`: device identity, onboarding, exposure, and state
- `DeviceProcessEvents`: process creation and command lines
- `DeviceNetworkEvents`: outbound and inbound network activity associated with processes
- `DeviceFileEvents`: file creation, modification, rename, and deletion
- `DeviceImageLoadEvents`: loaded libraries and modules
- `DeviceRegistryEvents`: registry persistence and configuration changes
- `DeviceLogonEvents`: local and remote device logons
- `DeviceEvents`: security-control and miscellaneous endpoint actions
- `DeviceNetworkInfo`: network interface and addressing context

## Workflow

1. Resolve device names and IDs.
2. Establish activity volume and first/last seen times.
3. Inspect the suspicious process and its parent/child relationships.
4. Pivot to network, file, image-load, registry, and logon telemetry using stable IDs, hashes, accounts, and a tight time window.
5. Scope the same indicators across other devices.
6. Look for benign prevalence and expected software-management or administrative context.
7. Produce an ordered UTC timeline and state telemetry gaps.

## Query patterns

Resolve a device:

```kusto
DeviceInfo
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where DeviceName =~ "<device-name>"
| summarize arg_max(Timestamp, *) by DeviceId
| project Timestamp, DeviceId, DeviceName, OSPlatform, OSVersion, OnboardingStatus, ExposureLevel
| take 20
```

Triage process prevalence before retrieving commands:

```kusto
DeviceProcessEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where DeviceId == "<device-id>"
| summarize Executions=count(), FirstSeen=min(Timestamp), LastSeen=max(Timestamp),
            Accounts=dcount(AccountUpn) by FileName, SHA1
| order by Executions asc
| take 200
```

Inspect a bounded process chain:

```kusto
DeviceProcessEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where DeviceId == "<device-id>"
| where FileName =~ "<process.exe>" or InitiatingProcessFileName =~ "<process.exe>"
| project Timestamp, DeviceId, DeviceName, FileName, ProcessCommandLine, SHA1,
          ProcessUniqueId, InitiatingProcessFileName, InitiatingProcessCommandLine,
          InitiatingProcessUniqueId, AccountUpn
| order by Timestamp asc
| take 500
```

Pivot network activity from a process hash or unique ID only after confirming the relevant columns:

```kusto
DeviceNetworkEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where DeviceId == "<device-id>"
| where InitiatingProcessSHA1 == "<sha1>"
| summarize Connections=count(), FirstSeen=min(Timestamp), LastSeen=max(Timestamp)
    by RemoteIP, RemoteUrl, RemotePort, InitiatingProcessFileName
| order by Connections desc
| take 200
```

Scope a hash across devices:

```kusto
DeviceProcessEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where SHA1 == "<sha1>" or InitiatingProcessSHA1 == "<sha1>"
| summarize Executions=count(), FirstSeen=min(Timestamp), LastSeen=max(Timestamp)
    by DeviceId, DeviceName, FileName
| order by Executions desc
| take 500
```

## Interpretation cautions

- Command-line encoding, LOLBin use, unsigned files, rare hashes, and unusual parent-child relationships are leads, not verdicts.
- Distinguish connection attempts from successful sessions using `ActionType` and surrounding telemetry.
- A public IP might be a proxy, CDN, VPN, or shared service.
- Process and network clocks can differ slightly; use a justified correlation tolerance.
- Device isolation or remediation status cannot be inferred unless directly represented in queried telemetry.
