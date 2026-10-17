# Server boundary
Reserved for future Netlify Functions. Sprint 0 exposes no business endpoints, authentication, monitoring, or database connections. Future handlers must validate authenticated identity and organization membership server-side before calling application use cases.

Sprint 3C adds a hard-disabled authentication endpoint under
`/.netlify/functions/authentication/:action`. It returns safe errors and never
creates a session or invokes a provider, store, or business mutation. The server
policy and uncomposed integration ports are documented in
`docs/sprint-3c-report.md`. No environment variable activates the adapter.
