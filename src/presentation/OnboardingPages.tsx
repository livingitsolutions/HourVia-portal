import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, ShieldCheck, Moon, Sun } from "lucide-react";
import {
  authMessages,
  recoverySchema,
  registrationSchema,
  resetSchema,
  signInSchema,
} from "../application/authentication";
import {
  invitationPresentation,
  organizationDraftSchema,
  switchPreviewTenant,
  visibleActions,
  type OrganizationDraft,
} from "../application/onboarding";
import {
  previewOrganizationWorkflows,
  previewInvitation,
  previewOrganizations,
} from "../infrastructure/preview-onboarding";
import type { Invitation, Membership } from "../domain/organization";
import { AuthForm, type AuthField } from "./AuthForm";
const PreviewContext = createContext({
  selectedId: "",
  select: (() => {}) as (id: string) => void,
  clear: () => {},
});
export function OnboardingPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selectionVersion = useRef(0);
  const clear = useCallback(() => {
    selectionVersion.current += 1;
    setSelectedId("");
  }, []);
  return (
    <PreviewContext.Provider
      value={{
        selectedId,
        select: (id) => {
          const version = ++selectionVersion.current;
          setSelectedId("");
          void previewOrganizationWorkflows.selectOrganization({ organizationId: id }).then(result => {
            if (selectionVersion.current === version) setSelectedId(result.ok ? result.value.organizationId : "");
          });
        },
        clear,
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}
export function PreviewOrganizationSelector() {
  const { selectedId, select } = useContext(PreviewContext);
  return (
    <label className="preview-selector">
      Organization context · Preview
      <select
        aria-label="Preview organization context"
        value={selectedId}
        onChange={(e) => select(e.target.value)}
      >
        <option value="">No organization selected</option>
        {previewOrganizations.map((c) => (
          <option key={c.organization.id} value={c.organization.id}>
            {c.organization.name} · {c.membership.role}
          </option>
        ))}
      </select>
    </label>
  );
}
export const journeyRoutes = [
  "/auth/sign-in",
  "/auth/create-account",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/auth/session-expired",
  "/auth/access-denied",
  "/auth/invitation",
  "/onboarding/welcome",
  "/onboarding/create",
  "/onboarding/organizations",
  "/onboarding/dashboard",
];
const titles: Record<string, string> = {
  "/auth/sign-in": "Welcome back",
  "/auth/create-account": "Your next chapter starts here",
  "/auth/forgot-password": "Find your way back",
  "/auth/reset-password": "Choose a new password",
  "/auth/verify-email": "A moment to verify",
  "/auth/session-expired": "Let’s reconnect",
  "/auth/access-denied": "This space needs permission",
  "/auth/invitation": "You’re invited",
  "/onboarding/welcome": "Good work starts together",
  "/onboarding/create": "Make room for your organization",
  "/onboarding/organizations": "Choose where you work",
  "/onboarding/dashboard": "Your organization, in focus",
};
const email: AuthField = {
  name: "email",
  label: "Email address",
  type: "email",
};
const password: AuthField = {
  name: "password",
  label: "Preview password",
  type: "password",
  autoComplete: "new-password",
};
const confirm: AuthField = {
  name: "confirm",
  label: "Confirm preview password",
  type: "password",
  autoComplete: "new-password",
};
export function JourneyPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { clear } = useContext(PreviewContext);
  const [dark, setDark] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    if (pathname === "/auth/session-expired") clear();
  }, [pathname, clear]); // Preview context only; no server session exists.
  return (
    <div className={`journey${dark ? " dark" : ""}`}>
      <a className="skip" href="#journey-main">
        Skip to content
      </a>
      <header className="journey-header">
        <Link className="brand" to="/about">
          <Activity aria-hidden="true" />
          <span>
            hourvia<span className="brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label="Account navigation">
          <Link to="/auth/sign-in">Sign in</Link>
          <Link to="/auth/create-account">Create account</Link>
          <button
            className="icon-button"
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
        </nav>
      </header>
      <main id="journey-main" tabIndex={-1} className="journey-layout">
        <aside className="journey-story">
          <div className="eyebrow">TIME TRACKED. PROGRESS MADE.</div>
          <h2>
            A shared place.
            <br />A clearer <em>purpose.</em>
          </h2>
          <p>
            Bring your people, projects, and progress into view. Every workspace
            begins with an organization.
          </p>
          <div className="journey-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <p className="story-note">
            <ShieldCheck size={18} /> Organization first. Clear boundaries.
          </p>
          <Link to="/app">
            Explore the existing dashboard <ArrowRight size={16} />
          </Link>
        </aside>
        <section className="journey-card">
          <div className="eyebrow">HOURVIA · FOUNDATION PREVIEW</div>
          <h1 ref={heading} tabIndex={-1}>
            {titles[pathname]}
          </h1>
          <div className="demo-banner">
            <p>
              <strong>Demonstration only.</strong> Authentication is disabled.
              Nothing is sent or saved. Monitoring is OFF. Use invented details.
            </p>
          </div>
          {pathname === "/auth/sign-in" && (
            <>
              <p>Preview the sign-in form and its invalid credentials state.</p>
              <AuthForm
                fields={[
                  email,
                  { ...password, autoComplete: "current-password" },
                ]}
                schema={signInSchema}
                outcome="invalid"
              />
              <Link to="/auth/forgot-password">Forgot password?</Link>
              <Link className="journey-next" to="/onboarding/organizations">
                Explore organization selection without signing in{" "}
                <ArrowRight size={16} />
              </Link>
            </>
          )}
          {pathname === "/auth/create-account" && (
            <>
              <p>
                One global identity. Membership in the organizations you work
                with.
              </p>
              <AuthForm
                fields={[
                  { name: "name", label: "Full name" },
                  email,
                  password,
                  confirm,
                ]}
                schema={registrationSchema}
                outcome="unavailable"
                onValid={() => navigate("/auth/verify-email")}
              />
              <Link to="/auth/sign-in">Already have an account? Sign in</Link>
            </>
          )}
          {pathname === "/auth/forgot-password" && (
            <>
              <AuthForm
                fields={[email]}
                schema={recoverySchema}
                outcome="recovery"
              />
              <Link to="/auth/reset-password">
                Explore reset password state
              </Link>
            </>
          )}
          {pathname === "/auth/reset-password" && (
            <>
              <p>
                A live reset requires a trusted, single-use recovery credential.
                This preview cannot change a password.
              </p>
              <AuthForm
                fields={[password, confirm]}
                schema={resetSchema}
                outcome="unavailable"
              />
            </>
          )}
          {pathname === "/auth/verify-email" && <VerificationPreview />}
          {pathname === "/auth/session-expired" && (
            <>
              <p role="status">{authMessages.expired}</p>
              <Link className="primary-button" to="/auth/sign-in">
                Return to sign in
              </Link>
            </>
          )}
          {pathname === "/auth/access-denied" && (
            <>
              <p role="alert">
                An active organization membership and server-verified permission
                are required. Contact your organization administrator.
              </p>
              <Link to="/onboarding/organizations">
                Choose another organization
              </Link>
            </>
          )}
          {pathname === "/auth/invitation" && <InvitationPreview />}
          {pathname === "/onboarding/welcome" && (
            <>
              <p>
                You bring the ambition. Start with an organization that gives
                your team a shared context.
              </p>
              <p>
                No personal workspaces. A single-member organization is
                available for solo consultants. Every active organization
                requires exactly one owner.
              </p>
              <Link className="primary-button" to="/onboarding/create">
                Plan your organization <ArrowRight size={16} />
              </Link>
              <Link className="journey-next" to="/onboarding/organizations">
                Join an existing organization
              </Link>
            </>
          )}
          {pathname === "/onboarding/create" && <OrganizationWizard />}
          {pathname === "/onboarding/organizations" && (
            <OrganizationSelection />
          )}
          {pathname === "/onboarding/dashboard" && <OrganizationPreview />}
          <nav className="journey-links" aria-label="Preview states">
            <Link to="/onboarding/welcome">Onboarding</Link>
            <Link to="/auth/invitation">Invitation</Link>
            <Link to="/auth/session-expired">Session expired</Link>
            <Link to="/auth/access-denied">Access denied</Link>
          </nav>
        </section>
      </main>
      <footer className="journey-footer">
        Hourvia by Living IT Solutions{" "}
        <span>UI preview · No live authentication or persistence</span>
      </footer>
    </div>
  );
}
export function VerificationPreview() {
  const [state, setState] = useState<"pending" | "verified" | "expired">(
    "pending",
  );
  return (
    <>
      <label htmlFor="verification-state">
        Verification preview state
        <select
          id="verification-state"
          value={state}
          onChange={(e) => setState(e.target.value as typeof state)}
        >
          <option value="pending">Pending</option>
          <option value="verified">Verified preview</option>
          <option value="expired">Expired link</option>
        </select>
      </label>
      <p role="status">
        {state === "pending"
          ? authMessages.pending
          : state === "verified"
            ? authMessages.verified
            : "Verification link expired — preview. Request a new link when authentication is enabled."}
      </p>
      <button disabled className="primary-button">
        Resend unavailable
      </button>
      <Link className="journey-next" to="/onboarding/welcome">
        Explore onboarding preview <ArrowRight size={16} />
      </Link>
    </>
  );
}
export function InvitationPreview() {
  const [state, setState] = useState<Invitation["state"]>("pending");
  const [audience, setAudience] = useState("signed-out");
  const invitation = { ...previewInvitation, state };
  const effective = invitationPresentation(invitation, Date.now());
  return (
    <>
      <p>
        Cedar Design Studio invites <strong>{invitation.email}</strong> as{" "}
        <strong>{invitation.role}</strong>.
      </p>
      <label htmlFor="invite-state">
        Invitation state
        <select
          id="invite-state"
          value={state}
          onChange={(e) => setState(e.target.value as Invitation["state"])}
        >
          {["pending", "accepted", "expired", "revoked"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label htmlFor="invite-audience">
        Recipient experience
        <select
          id="invite-audience"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        >
          <option value="signed-out">Authentication required</option>
          <option value="existing">Existing user preview</option>
          <option value="new">New user preview</option>
        </select>
      </label>
      <p role="status">
        {effective === "pending"
          ? audience === "signed-out"
            ? "Sign in to review this invitation. Authentication is required."
            : "Pending invitation preview. Verified recipient, expiry, revocation, and active membership must be checked on the server before acceptance."
          : effective === "accepted"
            ? "Accepted state preview. No membership or permissions were granted."
            : `This invitation is ${effective}. Ask an organization administrator for a new invitation.`}
      </p>
      {effective === "pending" && (
        <Link
          to={audience === "new" ? "/auth/create-account" : "/auth/sign-in"}
        >
          {audience === "new" ? "Create account preview" : "Sign in preview"}
        </Link>
      )}
      <button className="primary-button" disabled>
        Accept invitation unavailable
      </button>
    </>
  );
}
export function OrganizationWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OrganizationDraft>({
    name: "",
    industry: "",
    timezone: "Etc/UTC",
  });
  const [error, setError] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, [step]);
  return (
    <>
      <ol className="wizard-steps" aria-label="Organization creation progress">
        {["Name", "Details", "Review", "Completion"].map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <h2 ref={title} tabIndex={-1}>
        {
          [
            "Name your organization",
            "A few useful details",
            "Review your organization",
            "Your plan is ready to preview",
          ][step]
        }
      </h2>
      {step < 2 ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = organizationDraftSchema.safeParse(draft);
            if (
              step === 0
                ? draft.name.trim().length < 2 || draft.name.trim().length > 120
                : !parsed.success
            ) {
              setError(
                step === 0
                  ? "Use an organization name between 2 and 120 characters."
                  : parsed.success
                    ? ""
                    : parsed.error.issues[0].message,
              );
              e.currentTarget.querySelector<HTMLInputElement>("input")?.focus();
              return;
            }
            setError("");
            setStep(step + 1);
          }}
        >
          {step === 0 ? (
            <label htmlFor="org-name">
              Organization name
              <input
                id="org-name"
                value={draft.name}
                maxLength={120}
                required
                aria-describedby="org-error"
                aria-invalid={Boolean(error)}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
          ) : (
            <>
              <label htmlFor="org-industry">
                Industry
                <input
                  id="org-industry"
                  value={draft.industry}
                  maxLength={100}
                  required
                  aria-describedby="org-error"
                  onChange={(e) =>
                    setDraft({ ...draft, industry: e.target.value })
                  }
                />
              </label>
              <label htmlFor="org-timezone">
                Organization time zone
                <input
                  id="org-timezone"
                  value={draft.timezone}
                  maxLength={100}
                  required
                  aria-describedby="org-error"
                  onChange={(e) =>
                    setDraft({ ...draft, timezone: e.target.value })
                  }
                />
              </label>
            </>
          )}
          <p id="org-error" role="alert">
            {error}
          </p>
          <button className="primary-button" type="submit">
            Continue
          </button>
        </form>
      ) : (
        <>
          <dl className="review-details">
            <dt>Organization</dt>
            <dd>{draft.name.trim()}</dd>
            <dt>Industry</dt>
            <dd>{draft.industry}</dd>
            <dt>Time zone</dt>
            <dd>{draft.timezone}</dd>
            <dt>Ownership policy</dt>
            <dd>
              Exactly one OWNER, assigned by the server after authentication.
            </dd>
          </dl>
          <p role="status">
            {step === 2
              ? "Review only. No organization, ownership or membership changes are available."
              : "Completion preview. Your organization has not been created. Nothing was saved."}
          </p>
          {step === 2 ? (
            <button className="primary-button" onClick={async () => {
              const result = await previewOrganizationWorkflows.createOrganization({ name: draft.name, idempotencyKey: "preview-review" });
              if (result.ok) { setError(""); setStep(3); }
              else setError("Simulation unavailable. Review your organization name.");
            }}>
              Preview completion
            </button>
          ) : (
            <Link className="primary-button" to="/onboarding/organizations">
              Explore sample organizations
            </Link>
          )}
        </>
      )}
      {step > 0 && (
        <button className="secondary-button" onClick={() => setStep(step - 1)}>
          Back
        </button>
      )}
    </>
  );
}
export function OrganizationSelection() {
  const [empty, setEmpty] = useState(false);
  const { clear } = useContext(PreviewContext);
  return (
    <>
      <p>
        A global user can belong to multiple organizations. These are public
        sample memberships, with no live access.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={empty}
          onChange={(e) => {
            setEmpty(e.target.checked);
            clear();
          }}
        />
        Show empty organization state
      </label>
      {empty ? (
        <>
          <h2>No organizations yet</h2>
          <p>
            Create an organization or ask your administrator for an invitation.
          </p>
        </>
      ) : (
        <>
          <PreviewOrganizationSelector />
          <ul className="membership-list">
            {previewOrganizations.map((c) => (
              <li key={c.organization.id}>
                <strong>{c.organization.name}</strong>
                <span>{c.membership.role} · Active sample membership</span>
              </li>
            ))}
          </ul>
          <Link className="primary-button" to="/onboarding/dashboard">
            Open organization preview
          </Link>
        </>
      )}
      <Link className="journey-next" to="/onboarding/create">
        Create an organization preview
      </Link>
      <h2>Pending invitations</h2>
      <p>Cedar Design Studio · EMPLOYEE · Sample invitation</p>
      <Link to="/auth/invitation">Review invitation</Link>
    </>
  );
}
function MemberListingPreview({ organizationId }: { organizationId: string }) {
  const [members, setMembers] = useState<readonly Membership[]>([]);
  const [state, setState] = useState("loading");
  const [scenario, setScenario] = useState("sample");
  useEffect(() => {
    let active = true;
    previewOrganizationWorkflows.listMembers({ organizationId }).then(result => {
      if (!active) return;
      setMembers(result.ok ? result.value : []);
      setState(result.ok ? "ready" : "error");
    });
    return () => { active = false; };
  }, [organizationId]);
  return <section aria-label="Member listing preview">
    <h3>Organization members · Simulated</h3>
    <label>Member listing state
      <select value={scenario} onChange={e => setScenario(e.target.value)}>
        <option value="sample">Sample members</option>
        <option value="empty">Empty preview</option>
        <option value="error">Unavailable preview</option>
      </select>
    </label>
    {scenario === "error" || state === "error" ? <p role="alert">Member preview unavailable. Try another organization.</p>
      : scenario === "empty" ? <p>No sample members to display.</p>
      : state === "loading" ? <p>Loading sample members…</p>
      : <ul className="membership-list">{members.map(m => <li key={m.userId}><strong>{m.userId}</strong><span>{m.role} · {m.status} · Public sample</span></li>)}</ul>}
    <p>No membership or access was granted. Changes require server authorization.</p>
  </section>;
}
export function OrganizationPreview() {
  const { selectedId, clear } = useContext(PreviewContext);
  const selected = switchPreviewTenant(
    previewOrganizations,
    selectedId,
  ).selected;
  return (
    <>
      <PreviewOrganizationSelector />
      {selected ? (
        <section key={selected.organization.id}>
          <h2>{selected.organization.name}</h2>
          <p>{selected.membership.role} · Preview context only</p>
          <p>
            Organization dashboard preview. No projects, timesheets or billing
            records are loaded.
          </p>
          <MemberListingPreview key={selected.organization.id} organizationId={selected.organization.id} />
          <ul className="permission-list">
            {visibleActions(selected.membership.role).map((a) => (
              <li key={a.label}>
                {a.label}
                <button disabled>Server operation disabled</button>
              </li>
            ))}
          </ul>
          {visibleActions(selected.membership.role).length === 0 && (
            <p>No administrative navigation for this sample role.</p>
          )}
          <p>
            Navigation reflects the existing permission policy. Every live
            operation still requires server authorization.
          </p>
        </section>
      ) : (
        <p role="status">
          Select an active sample organization to preview its navigation.
        </p>
      )}
      <button className="secondary-button" onClick={clear}>
        Clear preview context
      </button>
      <Link className="journey-next" to="/auth/sign-in" onClick={clear}>
        Sign out preview · Clear context
      </Link>
    </>
  );
}
