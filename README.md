# pi-defender-xdr

[![CI](https://github.com/andrewtchilds/pi-defender-xdr/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewtchilds/pi-defender-xdr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A pi package for Microsoft Defender XDR Advanced Hunting. It runs hunting queries, inspects the tenant schema, exports results on request, and adds investigation skills for endpoint, identity, email, Teams, and cross-domain cases.

## Prerequisites

Create a Microsoft Entra app registration in your tenant, then configure it:

1. Add the **Mobile and desktop applications** platform with the redirect URI `http://localhost`.
2. Enable public client flows.
3. Add the **delegated** Microsoft Graph permission **ThreatHunting.Read.All**.
4. Grant tenant admin consent.
5. Record the tenant ID and client ID.

The signed-in user must also have the required Microsoft Defender permissions and access to the data that they query.

## Install

Install the package from GitHub:

```bash
pi install git:github.com/andrewtchilds/pi-defender-xdr
```

For development:

```bash
npm ci
npm run verify
npm run pack:check
pi -e ./extensions/defender-xdr/index.ts
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before you submit a change.

## Configure and sign in

Run:

```text
/xdr-login
```

On first use, enter the tenant ID and client ID for your Entra app registration. The command saves the configuration and opens the browser for sign-in.

The configuration is stored in `defender-xdr/config.json` under pi's agent configuration directory. The default path is:

```text
~/.pi/agent/defender-xdr/config.json
```

You can override the stored configuration with these environment variables:

- `PI_XDR_TENANT_ID`
- `PI_XDR_CLIENT_ID`
- `PI_XDR_API_BASE_URL`
- `PI_XDR_AUTHORITY_HOST`

To sign out, run:

```text
/xdr-logout
```

## Investigation skills

The package includes four investigation skills:

- `defender-xdr-investigation` handles cross-domain triage, pivots, timelines, and reporting.
- `defender-xdr-endpoint-investigation` handles processes, network connections, files, the registry, sign-ins, and device scope.
- `defender-xdr-identity-investigation` handles Entra sign-ins, service principals, directory changes, and cloud accounts.
- `defender-xdr-messaging-investigation` handles email, Teams, attachments, URLs, clicks, and delivery.

## References

- [Microsoft Graph `runHuntingQuery`](https://learn.microsoft.com/en-us/graph/api/security-security-runhuntingquery?view=graph-rest-1.0)
- [Microsoft Graph Security API overview](https://learn.microsoft.com/en-us/graph/api/resources/security-api-overview?view=graph-rest-1.0)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference#threathuntingreadall)
- [Defender XDR Advanced Hunting schema](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-schema-tables)
- [Advanced Hunting schema changes](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-schema-changes)
