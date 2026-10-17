# Sprint 5A — Time tracking engine and interactive preview

## 1. Verified baseline

On 2026-10-17, the credential-free GitHub main API returned `dcfab8eec40096441dc7ce2ab4b277c39749916d`, matching local HEAD. The initial working tree was clean. Git remote lookup is disabled by the managed runner; public HTTPS API reads provided verification. Sprint 4A.2 report, application command composition, Sprint 3B membership/authorization and transaction contracts, Sprint 3C trusted authentication boundaries, existing dashboard formatting, domain entities, offline database schema, architecture guard, and presentation tokens were reviewed. No reusable time-entry/duration domain primitive existed; dashboard floating-hour formatting remains specific to dashboard fixtures.

Sprint 4B.2 delivery is separate: GitHub pull #16 is reported merged at 2026-10-17T05:58:52Z with merge SHA `6e225ddd7c8fa638446753532e4690cf009bdf8e`; its only changed file is `docs/sprint-4b2-report.md`. The main API still returned the earlier SHA on a repeated request, and this checkout does not contain that report. This is an observed API/checkout discrepancy, not a code dependency. No direct Git synchronization or writes were attempted.

## 2. Exact changed files

- `src/domain/time-tracking.ts`
- `src/application/organization.ts`
- `src/application/time-validation.ts`
- `src/application/time-tracking.ts`
- `src/application/time-tracking.test.ts`
- `src/infrastructure/preview-time-tracking.ts`
- `src/presentation/App.tsx`
- `src/presentation/TimeTracking.tsx`
- `src/presentation/styles.css`
- `src/presentation/time-tracking.test.ts`
- `docs/sprint-5a-report.md`
- `.netlify/results.md`

## 3. Time-tracking domain

Added TimeEntry, RunningTimer, TimerSession, TimeEntryRevision, TimeEntrySource and draft/submitted/approved/locked/void lifecycle states. Entries carry organization/user ownership, description, billable flag, optional project/client references, start/end instants, source, session association, timestamps and version. UTC epoch milliseconds represent instants and integer milliseconds represent durations. `elapsedMs` represents the entry's time range; `durationMs` is separately adjustable. Revisions preserve both prior and corrected snapshots, actor, reason and timestamp. Correcting a timer entry retains its source and session reference.

Manual validation rejects nonfinite, out-of-range, fractional or negative duration input and requires start before end. Timezone display is explicit. UTC manual input avoids ambiguous local wall times; it supports separate end dates and seconds. The UI rejects normalized invalid calendar dates. Daily/weekly reporting assigns the entire recorded duration to the start date in the selected timezone, including overnight entries; it does not split entries at midnight. Weeks run Monday–Sunday. Voids are excluded from totals.

## 4. Application commands and contracts

Commands start, stop, read active timer/entries, update description, resume an existing entry as a new session, explicitly discard, create manual entries, correct draft entries and explicitly void. Stop uses the injected authoritative adapter clock, never a command-supplied client timestamp. Same-instant or backwards stops reject and retain the active timer. Replaying the same actor/organization/key/input returns the original result; different input with that key conflicts. A repeated stop with a fresh key also returns the existing session entry without another write or audit event. A start with a fresh key while running conflicts.

Added timer, entry and revision repository ports plus authorization inside the transaction. Reused Clock, Result, OrganizationContext, AuditEvent and existing workflow replay/complete/audit contracts. The existing TransactionRunner now accepts a transaction type parameter with its original default, preserving organization consumers and avoiding a second transaction protocol. Successful commands, revision snapshots, idempotency results and audit append belong to the same commit/rollback boundary. Reads reauthorize too. Unauthorized replays cannot bypass revoked membership.

## 5. Screens and interactions

The existing Time tracking navigation now opens a responsive interactive screen with prominent HH:MM:SS timer, active indicator, description, explicit description save, billable selection, project selection, stop/resume/discard controls, today's total and today's entries by default. Manual entry supports date/time ranges, description, billable status, optional project reference and adjusted duration. Corrections require a reason and matching version. Daily/weekly views provide selected-date, billable and project filters and filtered totals. Entry rows show recorded versus elapsed duration, source, lifecycle and revision number, with edit/resume/void actions.

Destructive actions require a separate confirm/cancel interaction. Loading, empty and command error states are rendered. Controls use accessible labels, native keyboard interaction and visible focus. Existing typography, green brand accents, workspace navigation and light/dark theme are retained. Mobile controls and forms collapse into a single column.

## 6. Preview adapter

A provider owns one isolated, disposable in-memory adapter per mounted application instance. It survives route navigation within that instance and resets on reload/unmount. Two explicitly named fixture organizations demonstrate isolation; switching context does not transfer, stop or reveal another organization's timer. The time screen's labeled selector owns its context independently of onboarding preview selection. Existing global shell organization text remains the established Living IT demo branding; the labeled time-tracking selector is authoritative for these demo actions.

Each simulated transaction clones state, serializes through an instance-local promise queue and commits only successful results. Returned objects, audit history and revisions are copied. Fixture controls support offline membership revocation and protected-entry tests; they are not live identity authority. No localStorage, network, database connection, real principal resolver or authentication fallback is used. Demo clock uses browser Date.now only for this explicitly labeled simulation; live adapters must supply server time. Different preview instances do not share records.

## 7. Authorization and security

The preview authorization adapter reuses central `evaluateAuthorization` with the `time.track` permission and current active fixture membership. Context is mandatory, ownership is checked, and changes to another user or organization are rejected. Submitted, approved, locked and void entries cannot be edited or voided through these workflows. There is no administrative override or approval correction workflow. Optimistic entry versions prevent stale changes. Read results fail closed if a repository returns a foreign resource.

Live Sprint 3C trusted principal resolution is unchanged. No authentication activation, production fallback, SQL execution, migrations, database connection, business function endpoint, workflow changes, monitoring, activity collection, payroll or payments were introduced.

## 8. Offline validation

Final validation commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:architecture`, `npm run check:secrets`, `git diff --check`. All passed. Tests: **24 files, 374 tests passed**, including new engine/domain coverage and 2 rendered interaction tests. No production build was run; build validation belongs to the managed system.

Coverage includes start/stop, duplicate start/stop, conflicting replay payload, 12 concurrent start attempts, invalid duration/ranges, overnight stopping, timezone midnight/DST boundaries, manual creation, adjustment/revision snapshots, optimistic version rejection, protected lifecycle states, confirmed discard/void, day/week/billable/project totals, unauthorized organization/member operations, cross-tenant timer isolation, revoked membership including replay, organization switching, audit uniqueness, rejected-command side effects, unavailable repository and adapter-instance isolation. Rendered tests exercise manual creation/correction/void confirmation, timer start/discard, organization switching and theme switching.

The concurrency test exercises single-process preview serialization only. It establishes no cross-process or PostgreSQL guarantee. Historical protected lifecycle states are seeded only in test fixtures; submission/approval are outside this sprint.

## 9. Known limitations

Everything is disposable demonstration state. No durable storage or cross-tab synchronization exists. No browser automation, visual screenshot validation or real-server clock/persistence/authentication test was run; rendered interaction tests use jsdom. Network loading is not simulated; loading states cover asynchronous adapter operations. Manual input uses UTC rather than local timezone conversion. Adjusted duration UI uses whole minutes; domain durations remain integer milliseconds. No total attribution split across dates, project/client directory validation, automatic approval correction, payroll, deletion purge, or submitted/approved mutation path exists. Description changes during an active session require Save description before stop.

## 10. PostgreSQL persistence requirements

A future native Netlify Database adapter must remain behind existing activation gates. It must implement this same transaction protocol with trusted principal/session and fresh membership rechecks under lock; tenant-scoped repositories/RLS; a database-enforced unique active timer per organization/user; atomic stop-entry creation and active-session removal; version-checked draft mutations; append-only immutable revisions and audit; actor/tenant/key uniqueness with canonical input digest and stored result; appropriate retry bounds and rollback; and authoritative server time. Project/client foreign keys must include tenant context. Same-session completed entries need a uniqueness constraint. Database bounds/checks must enforce valid instants, ranges and integer durations. PostgreSQL integration and concurrent connections must prove these guarantees before any live claim. No schema or migration was activated in Sprint 5A.

## 11. Recommended Sprint 5B

Resolve database binding/verification and activation prerequisites, then design quarantined time schema and repository adapters with real PostgreSQL isolation tests. Integrate trusted server authentication only after explicit activation authorization. Add durable timer recovery and multi-tab conflict UX, project/client tenant validation, agreed overnight reporting policy and explicit submission/approval correction workflows. Maintain the current live NO-GO until those gates pass.

## 12. Managed delivery

Files are prepared for Netlify Agent Runner's managed GitHub review and automatic build/deployment workflow. No manual commits, pushes, review creation, merges or deployments occurred. The resulting managed review URL and build/deployment outcome are unavailable in-session. Work stops after Sprint 5A.
