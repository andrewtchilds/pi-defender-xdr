# pi-defender-xdr

[![CI](https://github.com/andrewtchilds/pi-defender-xdr/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewtchilds/pi-defender-xdr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A pi package for delegated, read-only Microsoft Defender XDR Advanced Hunting. The package provides secure interactive authentication, bounded Microsoft Graph hunting queries, bundled/live schema discovery, and evidence-driven investigation skills.

## Prerequisite: existing Entra app registration

The package does **not** create or modify an Entra app registration. Before installing or using it, an administrator must provide a tenant-specific **public client** app registration configured as follows:

1. Record its Microsoft Entra tenant ID and application/client ID.
2. Add the **Mobile and desktop applications** platform with loopback redirect URI `http://localhost`.
3. Enable public-client flows if required by the registration.
4. Under **Microsoft Graph**, add delegated permission **ThreatHunting.Read.All** and grant tenant admin consent.
5. Do not create or supply a client secret.

The signed-in user must separately have applicable Microsoft Defender Unified RBAC/security-data permissions and any workload-specific access required for the queried tables. Entra API consent does not override Defender RBAC, product licensing, or device-group scoping.

> If you already have this registration, no registration work is required by this package. You only supply its tenant and client IDs.

## Install

Requires Node.js 20 or newer and a trusted package source. Pi packages execute with the user's system permissions; review the source before installation.

Install from GitHub:

```bash
pi install git:github.com/andrewtchilds/pi-defender-xdr
```

To inspect a local checkout before installing it:

```bash
git clone https://github.com/andrewtchilds/pi-defender-xdr.git
cd pi-defender-xdr
pi install .
```

For development:

```bash
npm ci
npm run verify
npm run pack:check
pi -e ./extensions/defender-xdr/index.ts
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change.

## Configure and sign in

```text
/xdr-login
```

On first use, `/xdr-login` asks for the tenant and client IDs of the existing registration, saves them, and continues directly into browser authentication. Settings are stored under pi's exported agent configuration directory, in `defender-xdr/config.json` (normally `~/.pi/agent/defender-xdr/config.json`). Environment variables override stored values:

- `PI_XDR_TENANT_ID`
- `PI_XDR_CLIENT_ID`
- `PI_XDR_API_BASE_URL`
- `PI_XDR_AUTHORITY_HOST`

To prevent bearer-token exfiltration, API and authority URLs are restricted to matching official Microsoft Graph global, US Government, or China cloud endpoints. Sovereign-cloud users must set both matching endpoints, either in `config.json` or with the two endpoint environment variables; arbitrary API proxies are intentionally unsupported.

The default delegated scope is `https://graph.microsoft.com/ThreatHunting.Read.All`. Advanced users can set `scopeMode` to `default` in `config.json` to use `https://graph.microsoft.com/.default` for a registration whose static delegated permission has already been consented. Query execution uses Microsoft Graph v1.0:

```text
POST https://graph.microsoft.com/v1.0/security/runHuntingQuery
```

`/xdr-login` is the only operation that may open the system browser. MSAL Node performs authorization-code flow with PKCE and a temporary localhost listener, supporting MFA and Conditional Access. The pi footer shows `XDR: logged out` or the username of the cached signed-in account. Hunting tools use silent acquisition only and return an actionable instruction when interaction is required.

Sign out with:

```text
/xdr-logout
```

## Run hunting queries

The `xdr_run_query` tool accepts read-only KQL plus an optional timespan such as `7d` or `P7D`. Results are bounded by `maximumRows` (1,000 by default), 2,000 output lines, and 50 KiB of tool output. Inline results use compact JSON, omit redundant OData type annotations, and include the response schema only when no rows are returned. API responses larger than 25 MiB are rejected so an unexpectedly broad query cannot consume unbounded memory. Narrow timespans and projected columns are recommended.

HTTP errors are normalized for invalid KQL, expired or rejected authentication, Defender RBAC failures, and throttling. Bounded retries honor short `Retry-After` values, and cancelling a tool call aborts its request. The tool never starts interactive login.

When the user explicitly asks to retain complete results, `export_results` writes JSON under `defender-xdr/exports` in pi's agent directory. Export directories and files use owner-only permissions (`0700` and `0600`). Exports can contain sensitive tenant data and are not deleted automatically.

## Discover the hunting schema

The `xdr_get_schema` tool can list tables, search table and column descriptions, or describe an exact table without authentication. Exact-table results default to compact column names and types; set `verbose=true` only when documentation URLs and full column descriptions are needed. The bundled snapshot is generated from a pinned commit of Microsoft's official Defender XDR documentation and currently contains 64 tables and 1,597 columns. Tables identified as retired in Microsoft's schema-change documentation are hidden by default and return replacement guidance.

For an exact table, `live=true` runs `<Table> | take 0` to verify the columns currently exposed to the signed-in tenant without retrieving event rows. Live results are cached in owner-only `schema-cache.json` for `schemaTtlHours` (seven days by default); `refresh=true` bypasses that TTL. Tenant licensing, deployed Defender products, RBAC, previews, and documentation timing can all affect schema availability.

Maintainers can refresh the pinned snapshot explicitly—normal package use never downloads schema documentation:

```bash
npm run update:schema
```

Review the resulting diff before publishing because Microsoft's schema changes regularly.

## Investigation skills

Pi discovers four on-demand skills from this package:

- `defender-xdr-investigation` — cross-domain triage, pivots, timelines, and reporting
- `defender-xdr-endpoint-investigation` — process, network, file, registry, logon, and device investigations
- `defender-xdr-identity-investigation` — Entra, service-principal, directory, and cloud-account investigations
- `defender-xdr-messaging-investigation` — email, Teams, attachment, URL, click, and delivery investigations

Each skill requires schema validation before querying, bounded UTC windows, stable-identifier pivots, explicit handling of coverage gaps, and separation of facts from inference. Skills never claim to perform containment or remediation. Load one explicitly with `/skill:<name>` or let pi select it from the task description.

## Token-cache security

The package first requires OS-backed persistence from `@azure/msal-node-extensions`:

- macOS Keychain
- Windows DPAPI/current-user protection
- Linux Secret Service/LibSecret

If secure persistence is unavailable, `/xdr-login` explicitly asks before enabling an unencrypted file cache. Declining stores no fallback approval. An approved fallback and its parent directory use owner-only permissions (`0600` and `0700`). The fallback can contain refresh credentials; restore the OS credential service and set `allowUnencryptedTokenCache` to `false` to stop using it.

Tokens, authorization headers, and serialized cache contents are never displayed or intentionally logged. Client secrets are rejected by configuration validation. See [SECURITY.md](SECURITY.md) for data-handling and vulnerability-reporting guidance.

## Opt-in real-tenant validation

After completing `/xdr-login`, run:

```bash
npm run test:tenant
```

This performs silent token acquisition and one bounded `AlertInfo | take 1` query. It never opens a browser, but it accesses real tenant metadata and consumes hunting API capacity. Normal `npm test` skips this test, and no real-tenant validation is performed during packaging.

## Current official references

Implementation was checked against:

- [Microsoft Graph `runHuntingQuery`](https://learn.microsoft.com/en-us/graph/api/security-security-runhuntingquery?view=graph-rest-1.0)
- [Microsoft Graph Security API overview](https://learn.microsoft.com/en-us/graph/api/resources/security-api-overview?view=graph-rest-1.0)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference#threathuntingreadall)
- [Defender XDR Advanced Hunting schema](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-schema-tables)
- [Advanced Hunting schema changes](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-schema-changes)
- [MSAL Node token acquisition](https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests)
- [MSAL Node public-client initialization](https://learn.microsoft.com/en-us/entra/msal/javascript/node/initialize-public-client-application)
- [Microsoft Authentication Extensions for Node](https://learn.microsoft.com/en-us/entra/msal/javascript/node/extensions)

This package accepts only delegated `ThreatHunting.Read.All`. Microsoft documents the older `api.security.microsoft.com` Advanced Hunting endpoint as retired, with data responses ending February 1, 2027.
