# Security

## Data and credential handling

`pi-defender-xdr` runs locally with the user's operating system permissions. It uses delegated Microsoft Graph access and does not accept client secrets.

- MSAL credentials are stored with macOS Keychain, Windows DPAPI, or Linux Secret Service when available.
- The extension uses an unencrypted, owner-only token cache only after the user approves it during sign-in.
- Hunting tools never start browser authentication.
- Access tokens, authorization headers, and serialized token caches must not be included in issue reports.
- Query output is sent to the active model as tool context. Optional exports can contain sensitive tenant data and are not deleted automatically.
- The extension is read-only, but the signed-in user's Defender RBAC and the delegated `ThreatHunting.Read.All` grant determine which data it can retrieve.

Before installing or updating the package, review its source, skills, dependency lockfile, and schema snapshot changes. Pi packages and skills run with your privileges and can affect how the model uses tools.

## Reporting a vulnerability

Do not put credentials, tokens, tenant identifiers, investigation data, or exploit details in a public report. Use [GitHub private vulnerability reporting](https://github.com/andrewtchilds/pi-defender-xdr/security/advisories/new). If that channel is unavailable, open a short, non-sensitive issue asking for private contact. Do not include details about the vulnerability.

Include the package version, operating system, Node.js version, reproduction conditions, and security impact. Revoke exposed sessions or grants through Microsoft Entra at once. Do not wait for a package response.

## Supported version

Until a stable release policy is published, only the most recent package version is intended to receive security fixes.
