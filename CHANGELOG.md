# Changelog

## Unreleased

- Fixed schema search to include the existing tenant schema cache without submitting a query
- Reject unprojected raw-event hunting queries and strengthen evidence-interpretation guidance
- Added GitHub repository metadata, CI, contribution guidance, and dependency updates
- Added a sovereign-cloud authority environment override and stale config temp-file cleanup
- Reduced model context usage with compact schema and query tool results
- Omit redundant result schemas and OData type annotations when rows are returned
- Added an exact interactive Entra sign-in fast path and moved extended identity queries to on-demand references
- Relaxed routine schema lookups when a verified query pattern already supplies known names and semantics
- Verify exact-table schema lookups against the signed-in tenant by default so tenant-specific and newly added columns (for example `RiskLevelDuringSignIn` on `EntraIdSignInEvents`) surface without an explicit flag; `live=false` restores the offline bundled view and live failures fall back to the bundled snapshot with a flag
- Shortened skill routing descriptions
- Reworked investigation skills around a shared evidence funnel, checkable completion criteria, truncation-aware reporting, and on-demand domain query references
- Resolved all dependency advisories, including bumping the pi-coding-agent dev dependency to pull patched undici, brace-expansion, protobufjs, postcss, and nanoid (all dev-only; runtime dependencies were unaffected)

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
