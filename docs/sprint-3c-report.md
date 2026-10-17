# Sprint 3C — Secure authentication integration foundation

Date: 2026-10-17. Scope: disabled integration contracts, offline security policy, and server composition foundations. No live authentication, business mutation, or persistence was activated.

## 1. Verified baseline

The credential-free public GitHub branches API returned main `d03c0e0a30bcf79852b618236fe77effb0b2ff63`, with merge message for pull request #11, implementing organization and membership workflows. Local history contains that merge and Sprint 3B implementation `6fd2288`. The supplied published staging deployment also identifies the same merge. The checkout initially had no changes. Sprint 3B baseline is complete for this offline scope.

Reviewed the full previous-attempt history, Sprint 3A/3B reports, existing authentication use cases, PrincipalResolver, identity assertions, global identity/session models, organization engine, onboarding routes, authorization matrix, architecture guard and database security documentation. Existing identity and membership models are reused. Database files, quarantined SQL and all workflows are unchanged.

## 2. Exact files changed

- `.netlify/results.md`
- `docs/sprint-3c-report.md`
- `netlify/functions/README.md`
- `netlify/functions/authentication.mts`
- `scripts/check-architecture.mjs`
- `server/authentication.ts`
- `server/authentication.test.ts`
- `server/organization-access.ts`
- `server/organization-access.test.ts`
- `src/application/server-authentication.ts`
- `src/presentation/OnboardingPages.tsx`
- `src/presentation/ServerAuthenticationStatus.tsx`
- `src/presentation/server-authentication.test.ts`
- `tsconfig.json`
- `vite.config.ts`

## 3. Provider assessment and recommendation

The installed dependency inventory contains no direct `@netlify/identity`, `@netlify/functions`, `openid-client`, or Auth0 browser SDK. No supported provider SDK is currently available in application composition. The supplied project configuration establishes Functions hosting and staging HTTPS, but does not establish end-user Identity enablement, external-provider configuration, or credentials. Those capabilities remain unverified; absence in redacted settings is not evidence they are unset. No secret-bearing settings were read or printed.

| Approach | Compatibility and callbacks | Identity and sessions | Configuration and complexity |
| --- | --- | --- | --- |
| Netlify Identity with current `@netlify/identity` | Platform-integrated user management with supported social providers; its callback/token/session semantics require separate review against this server-only design | Provider registration, confirmation and recovery available; browser hydration/storage defaults must not become Hourvia authority | Site enablement, provider credentials, mail settings and redirect allowlists; lower platform integration effort, more coupling to Identity semantics |
| Managed OIDC, such as Auth0, Okta or Entra External ID | Standards-based Authorization Code + S256 PKCE in Functions; exact HTTPS server callback and approved confidential client | Hosted registration/recovery and verified subject; reviewed OIDC implementation verifies ID tokens; Hourvia maintains opaque server sessions | Tenant, issuer, client authentication, callback/logout allowlists, scopes and operational policies; moderate integration effort, vendor costs and tenant lifecycle responsibility |
| Direct social OAuth | Code + PKCE where supported; provider-specific callbacks and user APIs | OAuth access authorization alone is not proof of OIDC identity or verified email; must use supported provider verification | Multiple credentials, verification APIs and inconsistent recovery/account semantics; highest integration maintenance |
| Browser SPA token authority | Vite-compatible, but conflicts with this sprint's server session boundary if browser tokens/storage establish authority | Browser roles or decoded JWTs cannot authorize Hourvia operations | Not selected for this foundation |
| Netlify team SSO (`context.user`) | Hosting/team access for Netlify collaborators | Not Hourvia end-user authentication or organization membership | Useful for platform administration only; not selected |

Preferred architecture: provider-neutral server BFF using a managed OIDC provider, with Auth0 as the first evaluation candidate, hosted registration/recovery, code + PKCE, and opaque HTTP-only Hourvia sessions. This is an architectural recommendation, not approval of a vendor or a provisioned tenant. Use a supported, reviewed Node OIDC implementation or provider server SDK in a later approved adapter; no SDK methods are assumed here. Keep local password forms preview-only. Do not introduce password storage.

Tradeoff: a server session store and reviewed identity bootstrap path add work but keep tokens out of the browser and allow current session/membership checks. Provider logout and local revocation remain separate operations. OIDC portability does not make provider configuration interchangeable without verification.

Reference entry points for operator review: [Netlify Identity](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/), [Functions API](https://docs.netlify.com/build/functions/api/), [Auth0 Authorization Code with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce), and [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html). These are assessment references; no live provider integration was tested.

## 4. Server authentication architecture

The new application ports cover initiation, callback, session retrieval/refresh, sign-out and organization selection. Session store contracts cover creation, atomic rotation, expiration and revocation. They reuse VerifiedIdentityAssertion, SessionIdentity, AuthenticatedPrincipal and PrincipalResolver. All composed browser and session-store methods return DISABLED. No runtime fake, environment activation toggle, SDK, provider credential or persistence client is composed.

The Functions endpoint accepts only defined action/method pairs under `/.netlify/functions/authentication/:action`; GET callback/session and POST initiate/refresh/sign-out/select-organization. It returns safe static JSON and no-store headers. Valid requests receive 503 DISABLED. Invalid hosts, origins, methods and actions fail closed. It ignores body identity, cookies and authorization claims, never issues cookies, and never redirects. The `/auth/callback` UI is a separate pending/disabled presentation route; it does not process provider credentials.

Uncomposed callback orchestration consumes a server-side attempt atomically using state plus a browser-binding digest, validates lifetime (maximum five minutes), exact callback URI, nonce presence, and stored verifier/S256 consistency. A trusted provider port must exchange the code with that verifier and cryptographically verify pinned issuer, audience/azp, allowed algorithm, signature, nonce, token type and lifetime using a reviewed SDK. It must handle trusted JWKS rotation with bounded retries; unknown keys or outages fail closed. The orchestration additionally compares the verified nonce and identity assertion issuer/audience/times. Provider errors are reduced to safe error codes. A consumed attempt is never retried after a failed exchange. Callback request parsing must reject duplicate query parameters in the later live adapter.

This is not an OIDC implementation: state storage, browser-binding cookie issuance, cryptographic signature verification, JWKS handling, code redemption and provider refresh are explicit unimplemented adapter obligations. A controlled double cannot prove those properties. Raw request JWT decoding is never used.

## 5. Session and cookie design

The prepared cookie policy is `__Host-hourvia-session`, Path=/, HttpOnly, Secure, SameSite=Lax, no Domain, and a maximum 900-second lifetime. Lax permits the top-level OIDC GET callback; no cross-site POST callback is approved. Deletion uses identical name/path/security scope. Cookie values must be bounded opaque base64url handles. A future attempt-binding cookie needs the same security attributes and a five-minute lifetime. No cookie is issued now.

The store contract requires cryptographically random server-generated handles, digest-only handle storage, existing issuer/subject-to-global-identity mapping, and atomic invalidation of old handles on creation/rotation. It must never adopt a client session ID or the provider's session ID as the browser handle. Provider credentials/tokens stay server-side. Session resolution reuses current expiry/revocation checks; provider revalidation is required before refresh extends lifetime. Target policy for later implementation: 15-minute idle lifetime, eight-hour absolute lifetime, revocation on sign-out, no rotation beyond absolute expiry, and fail-closed behavior if storage is unavailable. Absolute expiry/refresh metadata require reviewed storage/schema mapping before activation.

The request guard pins HTTPS origin and host to `https://hourvia-v3-staging.netlify.app`, rejects host mismatch, and requires exact Origin, same-origin fetch metadata when present, and a matching high-entropy session/attempt-bound synchronizer CSRF token for state changes. The token must be issued from a no-store same-origin response after a trusted lookup, not taken from two client-controlled values. A live adapter must extract its expected token from trusted storage. The disabled POST endpoint only checks Origin because it has no token issuance, authenticated state or side effects; full CSRF policy is prepared and tested but not composed into live mutations.

No durable revocation, session persistence, concurrent rotation guarantees or token refresh is claimed. Disabled sign-out is not a successful logout acknowledgment. A future live logout must invalidate storage before clearing the cookie and reporting success, and distinguish local logout from provider-wide logout. No unverified logout redirect is accepted.

## 6. Organization authorization integration

A server-only adapter exposes only the existing Sprint 3B engine's organization listing, selection and authorization methods. It accepts opaque session credentials and trusted dependencies; it exposes no mutations. Global identity remains independent of tenant membership, including multiple memberships. Selection is a requested context, never stored browser authority. Every subsequent call resolves the principal and loads current membership. Tests show revocation denies future selection/authorization, expiration denies listing, forged principal objects fail, and resource tenant mismatch denies access.

Exactly one active OWNER continues to be enforced by the existing aggregate validation/engine; ownership is not derived from OIDC role claims. Existing transactional revalidation, ownership-transfer and authorization tests are preserved. There are no enabled business endpoints.

## 7. Frontend changes

Authentication and organization-selection screens now include a separate server-authentication panel backed by the disabled application adapter. A sign-in availability action receives DISABLED, never fake success or a redirect. Callback pending, failure, signed-out, expiration, verification pending, organization selection and access denied are represented in a safe status projection. Controlled presentation doubles exercise these states; the runtime adapter cannot reach authenticated success. Existing preview forms, sample organizations and role displays remain visibly simulations. Callback URL parameters never enter this component; no credentials are sent, stored or logged. No localStorage authentication authority is introduced.

## 8. Offline security tests

New tests cover invalid callback state/browser binding, missing or mismatched nonce, missing verifier and inconsistent S256 challenge, expired/future attempts, nonfinite clocks, redirect mismatch, issuer/audience/identity rejection, one-time replay, provider failure/outage redaction, cookie attributes/injection/expiry bounds, CSRF missing/mismatch, invalid origin/host/HTTP, invalid methods/routes, hard-disabled actions, attacker cookie/session adoption rejection while disabled, disabled store creation/rotation/revocation/expiration, organization denial/revocation/expiration/cross-tenant attempts, and presentation states.

Existing principal-resolution tests continue to cover revoked/expired sessions and untrusted assertions; existing Sprint 3B tests cover ownership, multi-tenant authorization and mutations under controlled transactions. No-secret evidence is limited to the supported-pattern scan, server-only import guard and endpoint tests confirming static safe response bodies/no Set-Cookie despite attacker headers/query input. No browser bundle or live cryptographic provider validation is claimed.

## 9. Offline validation results

`npm run typecheck`, `npm run lint`, `npm test` (312 tests across 19 files), `npm run check:architecture`, `npm run check:secrets`, and `git diff --check` all passed. All previous tests are preserved. Vitest now includes server tests and TypeScript includes server/Functions files. Architecture checks now inspect server code and `.mts` Functions and reject direct server/Node imports from browser layers. These remain limited static checks, not a full transitive bundle security proof.

## 10. Live authentication blockers

Operator provider approval, tenant/client setup, a supported installed/reviewed server SDK, trusted discovery/JWKS configuration, provider and callback integration tests, verified identity bootstrap, durable attempt/session storage and revocation, refresh rotation, verified-email mapping, rate limits, security logging/redaction and recovery/logout acceptance tests remain required. No provider activation or credential provisioning was performed. Netlify Identity enablement was not run because no Identity integration was implemented and activation is explicitly excluded.

## 11. Database isolation blockers

Sprint 2.2E gates remain unchanged: authoritative resource/branch identity, production exclusion, immutable execution binding, verified TLS and restricted runtime credentials are unresolved. The reported presence of a database does not prove safe isolation. Native Netlify Database remains the intended durable storage. No migration, SQL, connection or provisioning was attempted. Existing schema/ports require a separately reviewed mapping for session attempts, token refresh metadata, absolute lifetime and identity bootstrap; do not use the migration owner or bypass RLS to implement authentication.

## 12. Production build and deployment

No production build command was run because this runner prohibits manual builds; automatic build validation belongs to managed delivery. No browser E2E or live authentication tests were executed. No manual deploy, commit, direct pull request, merge or workflow edit was attempted. Delivery/deployment status and resulting URL are unavailable until the managed runner completes.

## 13. Required operator configuration

After explicit approval: select provider and tenant/data region; configure a confidential web client, pinned issuer/client audience, minimal openid/profile/email scopes, allowed signing algorithms, exact staging callback `https://hourvia-v3-staging.netlify.app/.netlify/functions/authentication/callback`, and exact approved logout return URL. Avoid wildcard previews/branches and implicit or password grants. Configure hosted email verification, registration policy, recovery, MFA/step-up and mail delivery. Store client credentials and any token-encryption material only in server Functions-scoped configuration, never VITE variables. Add no credential values to reports or logs. Approve storage isolation, least-privilege session/bootstrap operations, expiry policy, atomic consumption/rotation, revocation and operational retention before composing an adapter. No environment flag in this sprint activates authentication.

## 14. Recommended Sprint 4 scope

Resolve database isolation evidence and provider approval first. Implement one reviewed OIDC adapter and verified Netlify Database session/attempt adapter behind the existing gates, with approved quarantined schema changes, provider-side verification tests, rotation/replay race tests, logout/revocation and callback/CSRF browser E2E. Review rate limiting, audit redaction, verified email and account linking before enabling authentication. Activate business mutations only in a separately scoped, reviewed sprint. Work stops after Sprint 3C.
