# Changelog

## Unreleased

- Added GitHub repository metadata, CI, contribution guidance, and dependency updates
- Added a sovereign-cloud authority environment override and stale config temp-file cleanup
- Reduced model context usage with compact schema and query tool results
- Omit redundant result schemas and OData type annotations when rows are returned
- Added an exact interactive Entra sign-in fast path and moved extended identity queries to on-demand references
- Relaxed routine schema lookups when a verified query pattern already supplies known names and semantics
- Shortened skill routing descriptions

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
