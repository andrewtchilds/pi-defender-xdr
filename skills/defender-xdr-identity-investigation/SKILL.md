---
name: defender-xdr-identity-investigation
description: Investigates Defender XDR identity activity. Use for Entra sign-ins, MFA or Conditional Access anomalies, password spray, privilege changes, OAuth activity, risky sessions, and account compromise.
license: MIT
compatibility: Requires the pi-defender-xdr extension, /xdr-login, and access to applicable identity hunting tables.
---

# Defender XDR Identity Investigation

Perform read-only identity hunting. Use `defender-xdr-investigation` for investigations that also require endpoint, alert, or messaging evidence.

## Rules

- Prefer `EntraIdSignInEvents` and `EntraIdSpnSignInEvents`; do not start from retired `AADSignInEventsBeta` tables.
- Use `xdr_get_schema` when a table, column, or current tenant shape is uncertain—not routinely for a known query pattern below.
- Resolve display names and UPNs to stable account or service-principal IDs before multi-table pivots.
- Treat geolocation, user agents, risk scores, and unfamiliar applications as signals, not proof of compromise.
- Separate failed authentication, successful authentication, token/session activity, and post-authentication actions.
- MFA being required does not prove MFA was completed. A successful sign-in does not by itself prove Conditional Access succeeded; inspect the relevant fields.
- Establish a bounded baseline before calling a country, IP, client, device, or application unusual.
- Empty results do not prove no activity occurred; consider retention, licensing, RBAC, ingestion, and unsupported authentication paths.

## Fast path: recent interactive sign-ins

`EntraIdSignInEvents.LogonType` is a JSON-like string. Interactive and non-interactive values are commonly `["interactiveUser"]` and `["nonInteractiveUser"]`. Use exact equality:

```kusto
EntraIdSignInEvents
| where AccountUpn =~ "<user-upn>"
| where LogonType == '["interactiveUser"]'
| project Timestamp, AccountUpn, AccountObjectId, Application,
          ResourceDisplayName, ErrorCode, IPAddress, Country, State, City,
          DeviceName, EntraIdDeviceId, OSPlatform, DeviceTrustType,
          IsManaged, IsCompliant, Browser, ClientAppUsed,
          AuthenticationRequirement, ConditionalAccessStatus,
          RiskLevelAggregated, RiskState, CorrelationId, SessionId, ReportId
| top <count> by Timestamp desc
```

Run with a narrow `timespan` and `max_rows=<count>`. Do not use `LogonType =~ "Interactive"`, and do not use `contains "interactiveUser"` because that can also match `nonInteractiveUser`.

Unless the user asks only for successes, retain failures and interpret `ErrorCode` per row. `ErrorCode == 0` generally indicates success. Repeated events sharing a `SessionId` are not necessarily separate authentication ceremonies.

## Investigation workflow

1. Resolve the account and tenant context.
2. Count successes and failures by time bucket, IP, application, client, and error code.
3. Compare the investigation window with a longer but bounded baseline.
4. Inspect authentication requirements, Conditional Access, risk, device compliance, and session/correlation IDs.
5. Pivot suspicious successful sessions to directory and cloud-application actions.
6. For password spray, scope one source across many accounts and distinguish failures from eventual successes.
7. Correlate across domains using stable object IDs, IPs, device IDs, and tight time bounds.

Likely sources are `EntraIdSignInEvents`, `EntraIdSpnSignInEvents`, `IdentityLogonEvents`, `IdentityDirectoryEvents`, `IdentityQueryEvents`, `IdentityInfo`, `CloudAppEvents`, `OAuthAppInfo`, `AlertInfo`, and `AlertEvidence`. Verify uncertain names with `xdr_get_schema`.

For deeper aggregation, spray, cloud-action, and service-principal patterns, read only the relevant section of [references/query-patterns.md](references/query-patterns.md).

## Reporting

State the time window and whether rows were truncated. Separate observed facts from assessment. Preserve relevant account, session, correlation, request, and report IDs when further pivots may be needed.
