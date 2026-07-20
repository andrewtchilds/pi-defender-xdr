# Security

## Data and credential handling

`pi-defender-xdr` runs locally with the user's operating-system permissions. It uses delegated Microsoft Graph access and never accepts a client secret.

- MSAL credentials are stored with macOS Keychain, Windows DPAPI, or Linux Secret Service when available.
- An unencrypted owner-only token cache is used only after explicit interactive approval.
- Hunting tools never start browser authentication.
- Access tokens, authorization headers, and serialized token caches must not be included in issue reports.
- Query output is sent to the active model as tool context. Optional exports can contain sensitive tenant data and are not deleted automatically.
- The extension is read-only, but the signed-in user's Defender RBAC and the delegated `ThreatHunting.Read.All` grant determine which data it can retrieve.

Review the package source, skills, dependency lockfile, and schema-snapshot changes before installation or update. Pi packages and skills execute with user privileges and can influence model tool use.

## Reporting a vulnerability

Do not disclose credentials, tokens, tenant identifiers, investigation data, or exploitable details in a public report. Use [GitHub private vulnerability reporting](https://github.com/andrewtchilds/pi-defender-xdr/security/advisories/new). If that channel is unavailable, open only a minimal, non-sensitive issue requesting private contact; do not include vulnerability details.

Include the package version, operating system, Node.js version, reproduction conditions, and security impact. Revoke exposed sessions or grants through Microsoft Entra immediately rather than waiting for a package response.

## Supported version

Until a stable release policy is published, only the most recent package version is intended to receive security fixes.
