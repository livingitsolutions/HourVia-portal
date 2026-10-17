# Sprint 3A — Authentication and organization onboarding foundation

2026-10-17. Functional, offline UI preview only. Live authentication, organization creation, invitation acceptance, membership mutations and persistence remain disabled. Track B is independent of database branch-isolation verification.

## 1. Verified GitHub baseline

Public GitHub branch API `GET /repos/livingitsolutions/Hourvia-V3/branches/main` returned `aaa223909e6ce93f62ef3b4da01a07cb044ce946`, matching local HEAD. Public pull request API confirmed PR #8 merged into main at `19b61f147ea4d8b9d117d06b3407763ceb615eb4` (Sprint 2.2D report delivery), and PR #9 merged into main at `aaa223909e6ce93f62ef3b4da01a07cb044ce946` (Sprint 2.2E). Both reports exist in the checkout. Historical baseline failures in those reports are not current baseline failures. `git ls-remote` is disabled by the runner; public HTTPS supplied verification without credentials or PATs. Initial working tree was clean.

Existing architecture, identity resolver, organization use cases, domain authorization policy, database security gates, quarantined migrations and workflows were preserved. The unresolved database isolation finding remains a blocker for persistence activation, not this offline sprint.

## 2. Exact files created and modified

Created:

- `src/application/authentication.ts`
- `src/application/onboarding.ts`
- `src/application/onboarding.test.ts`
- `src/infrastructure/preview-onboarding.ts`
- `src/presentation/AuthForm.tsx`
- `src/presentation/OnboardingPages.tsx`
- `src/presentation/onboarding.test.ts`
- `docs/sprint-3a-report.md`
- `.netlify/results.md` (managed delivery summary)

Modified:

- `src/presentation/App.tsx`
- `src/presentation/IdentityPages.tsx`
- `src/presentation/styles.css`
- `package.json`
- `package-lock.json`

Only test dependencies were added: Testing Library React, Testing Library user-event and jsdom. No runtime dependencies or state-management frameworks were added.

## 3. Authentication pages implemented

Sign in, create account, forgot password, reset password, email verification pending, invitation acceptance, session expired and access denied. Shared forms use Zod schemas, associated labels, inline errors, invalid-field focus, busy indicators, disabled submit during processing and live status feedback. Valid registration input navigates to an explicitly simulated verification state; it does not register a user. Password fields use invented values only and are cleared before simulated processing.

The provider-neutral application port covers registration, sign in/out, recovery, reset, verification, session retrieval and expiration. All methods on the disabled implementation return the existing `DISABLED` result. Existing trusted principal resolution remains unchanged and disabled at composition. No provider SDK, provider callbacks, credential persistence, JWT signing or session-cookie handling was introduced.

## 4. Organization onboarding flows

Welcome leads to organization name, industry and IANA time-zone details, creation review and completion preview. Back navigation preserves the temporary draft within the wizard; leaving discards it. Completion explicitly states that no organization was created. Every workspace is organization-owned, including single-member organizations; ownership remains a server responsibility.

Organization selection includes two public sample memberships for one global sample user, an empty-state toggle, and a pending invitation. The accessible native selector supports switching between OWNER and CONTRACTOR sample navigation. No organization is selected by default. Invitation presentation includes pending, accepted, expired and revoked states, time-based expiry, authentication-required, existing-user and new-user experiences. Acceptance stays disabled in every state.

## 5. Reused domain and authorization contracts

Reused `AuthenticatedPrincipal`, `Result`, `Organization`, `Membership`, `Invitation`, `Role`, `Permission` and `rolePermissions`. No duplicate identity, organization or membership domain models were introduced. Organization draft and preview-choice types are application presentation inputs, not new entities. Existing `OrganizationUseCases`, transaction boundaries, invitation credential validation and exactly-one-owner enforcement remain intact.

Presentation maps organization settings, member management, invitation management, project management, timesheet approvals and billing configuration to existing permission identifiers. OWNER and ADMIN retain the existing policy; MANAGER, EMPLOYEE and CONTRACTOR are tested against it. Preview administrative actions are disabled. Hidden navigation confers no authorization.

## 6. Preview adapter boundaries

`preview-onboarding.ts` contains public sample data and an asynchronous outcome simulator accepting only an outcome label. It accepts no credentials and returns no principal, session, authorization context or membership mutation. Application contracts do not import the preview infrastructure. Presentation never imports database infrastructure.

React context holds only the selected sample organization ID. It is not an authentication authority. Tenant switching recomputes the sample membership, renders tenant content under a tenant-specific key and carries no resource/draft state across tenants. Session-expired and sign-out preview controls clear the sample selection. No localStorage, persistence, network request or server endpoint is involved. Refresh resets preview selection.

## 7. Routes and navigation changes

New routes:

- `/auth/sign-in`
- `/auth/create-account`
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/verify-email`
- `/auth/session-expired`
- `/auth/access-denied`
- `/auth/invitation`
- `/onboarding/welcome`
- `/onboarding/create`
- `/onboarding/organizations`
- `/onboarding/dashboard`

The existing landing page at `/about` links to sign in and create account. Existing identity pages link to the new journey. The workspace switch link opens the new organization selection. Existing `/`, `/app`, demo modules and Sprint 1 identity routes remain available. The original dashboard remains a separately labeled fixed demonstration and is not a selected tenant's live dashboard. The new organization dashboard preview displays only the selected sample organization's context and permitted presentation actions.

## 8. Automated test results

Passed: `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:architecture`, `npm run check:secrets`, and `git diff --check`.

Vitest: 15 files, 247 tests passed, including 32 added tests. All existing tests were retained. New coverage includes authentication and organization validation, disabled authentication methods, preview outcomes, all new routes, invalid credentials, loading, recovery, registration-to-verification, pending/verified/expired verification, organization review/completion, multi-membership selection, invalid/revoked/mismatched selection, invitation lifecycle and expiry, all five roles, tenant isolation, session-expired clearing and accessibility-critical interactions. An initial accessible-label issue was corrected by separating error descriptions from label text; the subsequent suite passed. A synthetic credential fixture was adjusted to satisfy the unchanged secret scanner.

## 9. Accessibility verification

Testing Library and jsdom executed rendered DOM interactions: accessible names, first-invalid-input focus, `aria-invalid`, error descriptions, busy state, native select interaction, keyboard Tab navigation, disabled operations, theme control, skip-link target and route headings. Status announcements and semantic form elements are present. Wizard steps use `aria-current="step"` and focus their headings. Responsive CSS covers mobile, tablet and desktop; both theme palettes and reduced-motion support are present.

No real browser E2E, screen-reader session, visual viewport inspection, contrast audit or automated axe audit was executed. These remain review tasks before live launch; jsdom tests do not establish visual or full WCAG conformance.

## 10. Known limitations

This is functional UI with simulated outcomes, not live backend functionality. Invalid credentials are a deterministic preview; recovery sends nothing; reset cannot consume a credential; verification state is manually selectable; invitation recipient/state selectors are demonstration controls. No protected routes, session hydration or server operation was activated. Drafts and selection intentionally do not survive reloads. Sample invitations and memberships are illustrative, not claims of actual access. The existing dashboard continues to use its original public demo adapter and loading skeleton.

## 11. Database and authentication activation blockers

Sprint 2.2E did not verify authoritative connection-to-project/database/branch binding or immutable isolation; database execution remains NO-GO. No connection, SQL, migration, provisioning, database metadata call or business persistence was performed here.

A reviewed trusted provider adapter, secure server session lifecycle, verified email/recovery callbacks, anti-enumeration responses, abuse/rate controls and account lifecycle policy are required before live authentication. Live organization operations additionally require server-resolved principals, tenant-scoped authorization, recipient-bound single-use invitation credentials, transactional exactly-one-owner enforcement, concurrency/idempotency handling and audit controls already described by the existing architecture. Preview navigation cannot substitute for these controls.

## 12. Production build status

NOT RUN. Agent Runner prohibits build commands and performs automatic build validation separately. No build success is claimed by this report.

## 13. Deployment readiness

Ready for managed review and automatic preview build validation as an explicitly labeled UI-only foundation. Not ready for live authentication or persistence. No deployment, direct Git write, commit, manual PR creation or merge was performed. The runner owns delivery; a PR URL and deployment outcome were unavailable during implementation. No monitoring, employee tracking, payroll or payment collection was introduced.

## 14. Recommended Sprint 3B scope

Review provider selection and threat model, implement and test the trusted adapter and server session lifecycle behind disabled rollout controls, verify callbacks and abuse defenses, and add browser accessibility/responsive checks. Keep persistence work gated on independent resolution of database isolation. Implement server-authorized organization queries and invitation acceptance only after the required persistence and transaction guarantees are verified. Stop here at Sprint 3A.
