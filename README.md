# pi-defender-xdr

[![CI](https://github.com/andrewtchilds/pi-defender-xdr/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewtchilds/pi-defender-xdr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A pi package for Microsoft Defender XDR Advanced Hunting. Use it to run hunting queries, inspect the hunting schema, export results, and guide investigations.

## Prerequisites

You need a Microsoft Entra public client app registration. Configure the registration as follows:

1. Add the **Mobile and desktop applications** platform with the redirect URI `http://localhost`.
2. Enable public client flows.
3. Add the delegated Microsoft Graph permission **ThreatHunting.Read.All**.
4. Grant tenant admin consent.
5. Record the tenant ID and client ID.

The signed-in user must also have the required Microsoft Defender permissions and access to the data that they query.

## Install

Install the package from GitHub:

```bash
pi install git:github.com/andrewtchilds/pi-defender-xdr
```

To inspect a local checkout before installation:

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

- `defender-xdr-investigation` — Cross-domain triage, pivots, timelines, and reporting.
- `defender-xdr-endpoint-investigation` — Process, network, file, registry, sign-in, and device investigations.
- `defender-xdr-identity-investigation` — Entra, service principal, directory, and cloud account investigations.
- `defender-xdr-messaging-investigation` — Email, Teams, attachment, URL, click, and delivery investigations.

Load a skill with `/skill:<name>`, or let pi select one based on the task.

## References

- [Microsoft Graph `runHuntingQuery`](https://learn.microsoft.com/en-us/graph/api/security-security-runhuntingquery?view=graph-rest-1.0)
- [Microsoft Graph Security API overview](https://learn.microsoft.com/en-us/graph/api/resources/security-api-overview?view=graph-rest-1.0)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference#threathuntingreadall)
- [Defender XDR Advanced Hunting schema](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-schema-tables)
- [Advanced Hunting schema changes](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-schema-changes)
