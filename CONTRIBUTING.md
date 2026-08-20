# Contributing

Keep the package read-only and least-privileged. Treat all tenant data as sensitive.

## Development

Requires Node.js 20 or newer. The CI toolchain uses Node.js 22.

```bash
npm ci
npm run verify
npm run pack:check
```

Normal tests must not access a Microsoft tenant or open a browser. To run the opt-in tenant tests, sign in with `/xdr-login`, then run `npm run test:tenant`. Do not add these tests to CI or the package.

## Schema snapshot changes

Refresh the bundled schema only when you intend to review changes in Microsoft's documentation:

```bash
npm run update:schema
```

Before committing the snapshot, review the source commit, table status overrides, table and column counts, and the full generated diff. Never add schema or event data from a tenant to the repository.

## Pull requests

- Add or update tests for behavior changes.
- Keep tool output bounded and queries read-only.
- Never commit tokens, tenant identifiers, hunting results, exports, or local configuration.
- Update `README.md`, `SECURITY.md`, and `CHANGELOG.md` when applicable.

Report security issues through the private process in [SECURITY.md](SECURITY.md), not through a public pull request or detailed issue.
