# Hourvia by Living IT Solutions

**Time tracked. Progress made.**

Sprint 0 established an organization-first SaaS foundation using React, Vite, strict TypeScript, Tailwind CSS v4, React Router, Zod, Vitest, and ESLint. All displayed organization, project, membership, and time information is demonstration data. No production information is connected.

## Local setup

Use Node.js 22 or newer and npm. Run `npm ci`, then `npm run dev`. For Netlify emulation use `netlify dev --port 8889`. No environment variables or credentials are needed.

## Local verification

Run each command:

```sh
npm run typecheck
npm run lint
npm test
npm run check:architecture
npm run check:secrets
npm run build
```

The production build command is provided for local environments and Netlify's managed build. It must not be executed in an Agent Runner environment that prohibits builds. Architecture checking enforces source-layer dependencies; secret scanning checks known credential patterns without printing matches. Neither replaces security review or a dedicated scanner.

## Preview routes

`/` and `/app` show the demo organization overview. `/about` provides the product landing page. `/app/time`, `/app/timesheets`, `/app/projects`, `/app/reports`, and `/app/settings` show explicit future-module empty states. Sprint 1 added `/app/sign-in`, `/app/create-organization`, `/app/organizations`, `/app/team`, `/app/invitations`, and `/app/roles` as labeled nonfunctional identity and organization demonstrations. Preview forms validate fields locally without signing in or creating records. Unknown routes show a recovery page. The overview has loading and error recovery states, period selection, chart keyboard tooltips, theme switching, and a notification empty state. All controls are transient and reset when the page reloads.

## Boundaries and safeguards

See [architecture documentation](docs/architecture.md) for tenancy, ownership, authorization, isolation, and future database constraints. Domain contracts live in `src/domain`, use cases in `src/application`, demo adapters in `src/infrastructure`, and the UI in `src/presentation`. `netlify/functions` reserves the server boundary without activating APIs.

Exactly one OWNER per organization is required. Users may belong to multiple organizations. Personal workspaces are unsupported. Planned modules include organizations, invitations, roles, time tracking, attendance, approvals, clients, projects, billable hours, billing cut-off periods, invoice preparation, reports, and audits. Employee payroll and payslips are excluded. Future desktop monitoring stays OFF by default and requires notice, permissions, and consent.

No authentication, database connection, migrations, business API, monitoring, credentials, or GitHub Actions integration is included. No V1/V2 source is used. Delivery is handled exclusively by Netlify's managed source mechanism; no commits, branches, pull requests, or production deployments are created directly.

## Sprint 1 contracts

Provider-neutral identity/session contracts and an unwired server principal resolver reject malformed, expired, revoked, and unverified assertions. Organization aggregate rules cover provisioning, lifecycle, versioned ownership transfer, membership changes, and invitation lifecycle. A central deny-by-default permission matrix and server authorization evaluator require an active organization, active membership, and matching actor and resource tenants. Organization use cases and transaction/repository ports remain interfaces with no executable business API.

See [security boundaries](docs/security.md) and the [future PostgreSQL/Drizzle persistence design](docs/persistence-design.md). No provider or database is activated. Unit tests include ownership, version conflicts, cross-tenant denial, session validation, invitation rules, monitoring restrictions, the role matrix, and preview route rendering. Real database concurrency, RLS, and provider integration checks remain prerequisites for production activation.

## Sprint 2 persistence foundation (offline)

Drizzle PostgreSQL metadata and quarantined security/migration candidates now live in `db/`. No client, authentication, endpoint, database provisioning, migration or monitoring is activated. The public demonstration remains unchanged. Read [persistence design](docs/persistence-design.md), [operator gates](docs/persistence-operations.md), [adapter assessment](docs/netlify-database-assessment.md) and [Sprint 2 report](docs/sprint-2-report.md). Normal tests include offline schema, security-gate, idempotency and transaction semantics checks; disposable PostgreSQL tests require separate explicit authorization and never run with `npm test`.
