# Contributing

Contributions are welcome. Keep the package read-only, least-privileged, and safe for sensitive tenant data.

## Development

Requires Node.js 20 or newer. The CI toolchain uses Node.js 22.

```bash
npm ci
npm run verify
npm run pack:check
```

Normal tests must not access a Microsoft tenant or open a browser. Real-tenant validation is explicitly opt-in with `npm run test:tenant` after `/xdr-login` and must remain excluded from CI and packaging.

## Schema snapshot changes

Refresh the bundled schema only when intentionally reviewing Microsoft documentation changes:

```bash
npm run update:schema
```

Review the source commit, table status overrides, table and column counts, and the complete generated diff before committing it. Do not add tenant-derived schema or event data to the repository.

## Pull requests

- Add or update tests for behavior changes.
- Keep tool output bounded and queries read-only.
- Never commit tokens, tenant identifiers, hunting results, exports, or local configuration.
- Update `README.md`, `SECURITY.md`, and `CHANGELOG.md` when applicable.

Report security issues through the private process in [SECURITY.md](SECURITY.md), not through a public pull request or detailed issue.
