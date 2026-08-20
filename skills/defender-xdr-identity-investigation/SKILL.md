---
name: defender-xdr-identity-investigation
description: Investigates Defender XDR identity activity. Use for Entra sign-ins, MFA or Conditional Access anomalies, password spray, privilege changes, OAuth or service-principal activity, risky sessions, or account compromise.
license: MIT
compatibility: Requires the pi-defender-xdr extension, /xdr-login, and access to applicable identity hunting tables.
---

# Defender XDR identity investigation

Load and apply `defender-xdr-investigation` first. Its guardrails, query process, ledger, stop conditions, and report format apply here. This skill adds the identity-specific steps.

## Identity invariants

- Prefer active `EntraIdSignInEvents` and `EntraIdSpnSignInEvents` over retired `AADSignInEventsBeta` tables.
- Resolve display names and UPNs to `AccountObjectId`, and application names to stable application/service-principal IDs, before multi-table pivots.
- Separate failed authentication, successful authentication, token/session activity, and post-authentication actions.
- MFA required is distinct from MFA completed. Sign-in success is distinct from Conditional Access success; inspect the corresponding fields per event.
- Risk fields are not interchangeable. In `RiskLevelAggregated`, `0` means not set and `1` means none. A null or absent tenant-specific field such as `RiskLevelDuringSignIn` means unknown or unset. It does not prove that there was no risk. Verify the tenant's current columns before concluding that a field does not exist because the bundled documentation omits it.
- Establish a bounded baseline before describing a country, IP, client, device, application, or action as unusual. Never call one event routine, benign, anomalous, or malicious without comparison evidence sufficient for that classification.

## Fast path: recent interactive sign-ins

`EntraIdSignInEvents.LogonType` stores a JSON-like string. Interactive and non-interactive values are commonly `["interactiveUser"]` and `["nonInteractiveUser"]`. Use exact equality:

```kusto
EntraIdSignInEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
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

Run this with a matching narrow `timespan` and `max_rows=<count>`. Keep failures unless the question covers only successful sign-ins. `ErrorCode == 0` generally indicates success, but verify the meaning for the case. Several rows with one `SessionId` may belong to one authentication ceremony.

## Identity branch

1. **Resolve the principal.** Establish tenant context, stable account/application IDs, and enabled/role/risk context where relevant. Continue when every supplied name maps to candidate IDs or remains an explicit ambiguity.
2. **Characterize authentication.** Count successes and failures by time bucket, source, application, client, and error code. Compare the case interval with a longer bounded baseline. Continue when the data shows how the suspicious session differs from the baseline.
3. **Inspect controls and session continuity.** Review authentication requirement, Conditional Access, risk, device trust/compliance, correlation, request, report, and session IDs. Continue when claims about MFA, policy, and session linkage are field-supported or explicitly unresolved.
4. **Test impact.** Pivot suspicious successful sessions to directory and cloud application actions. For password spray, scope one source across accounts and check for later successes. For service principals and OAuth applications, inspect stable IDs, consent and privilege context, and subsequent use. Continue when evidence establishes post-authentication impact or a named coverage gap limits the finding.
5. **Return the identity ledger.** Preserve relevant account, application, session, correlation, request, and report IDs in an ordered UTC timeline.

Use `xdr_get_schema` for patterns outside the bundled reference, preview sources, or tenant drift. For aggregation, spray, cloud-action, directory, OAuth, and service-principal patterns, read only the relevant section of [references/query-patterns.md](references/query-patterns.md).
