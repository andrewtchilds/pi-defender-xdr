# Changelog

## Unreleased

## 0.1.1 - 2026-08-19

- Include the cached tenant schema in schema searches without submitting a query
- Reject raw-event hunting queries that do not project columns
- Clarify how investigation skills should interpret evidence
- Add repository metadata, CI, contribution guidance, and dependency updates
- Add a sovereign-cloud authority override
- Remove stale configuration temp files
- Reduce model context use with compact schema and query results
- Omit result schemas and OData type annotations when rows already provide that information
- Add a fast path for exact interactive Entra sign-in queries
- Move longer identity queries to references that load on demand
- Skip routine schema lookups when a verified query pattern supplies the table and column semantics
- Verify exact-table schema lookups against the signed-in tenant by default. This exposes tenant-specific and newly added columns such as `RiskLevelDuringSignIn` on `EntraIdSignInEvents`. Set `live=false` to use the bundled snapshot. If live verification fails, the tool returns the bundled snapshot and flags the fallback.
- Shorten skill routing descriptions
- Give all investigation skills the same evidence funnel, completion checks, truncation rules, and on-demand query references
- Resolve all dependency advisories. The pi-coding-agent development dependency now pulls patched versions of undici, brace-expansion, protobufjs, postcss, and nanoid. Runtime dependencies were unaffected.

## 0.1.0 - 2026-07-13

Initial prerelease:

- Delegated MSAL public-client login with PKCE and explicit browser interaction
- OS-backed token persistence with explicit owner-only fallback approval
- Login/logout commands and footer authentication status
- Microsoft Graph `ThreatHunting.Read.All` and `runHuntingQuery` support
- Bounded, cancellable query execution with throttling diagnostics and optional owner-only exports
- Bundled official schema snapshot plus optional tenant schema verification and TTL cache
- Endpoint, identity, messaging, and cross-domain investigation skills
- Opt-in silent real-tenant integration test
