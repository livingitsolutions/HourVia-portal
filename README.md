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

`/` and `/app` show the demo organization overview. `/about` provides the product landing page. `/app/time`, `/app/timesheets`, `/app/projects`, `/app/team`, `/app/reports`, and `/app/settings` show explicit future-module empty states. Unknown routes show a recovery page. The overview has loading and error recovery states, period selection, chart keyboard tooltips, theme switching, and a notification empty state. All controls are transient and reset when the page reloads.

## Boundaries and safeguards

See [architecture documentation](docs/architecture.md) for tenancy, ownership, authorization, isolation, and future database constraints. Domain contracts live in `src/domain`, use cases in `src/application`, demo adapters in `src/infrastructure`, and the UI in `src/presentation`. `netlify/functions` reserves the server boundary without activating APIs.

Exactly one OWNER per organization is required. Users may belong to multiple organizations. Personal workspaces are unsupported. Planned modules include organizations, invitations, roles, time tracking, attendance, approvals, clients, projects, billable hours, billing cut-off periods, invoice preparation, reports, and audits. Employee payroll and payslips are excluded. Future desktop monitoring stays OFF by default and requires notice, permissions, and consent.

No authentication, database connection, migrations, business API, monitoring, credentials, or GitHub Actions integration is included. No V1/V2 source is used. Delivery is handled exclusively by Netlify's managed source mechanism; no commits, branches, pull requests, or production deployments are created directly.
