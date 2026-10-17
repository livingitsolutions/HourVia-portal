import { useState } from "react";
import type { ZodType } from "zod";
import { authMessages } from "../application/authentication";
import { previewAuthOutcome } from "../infrastructure/preview-onboarding";
export interface AuthField {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
}
export function AuthForm({
  fields,
  schema,
  outcome,
  onValid,
}: {
  fields: readonly AuthField[];
  schema: ZodType;
  outcome: "invalid" | "unavailable" | "recovery";
  onValid?: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
        if (!parsed.success) {
          const next: Record<string, string> = {};
          for (const issue of parsed.error.issues)
            next[String(issue.path[0])] = issue.message;
          setErrors(next);
          setMessage("Check the highlighted fields.");
          form
            .querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)
            ?.focus();
          return;
        }
        setErrors({});
        setBusy(true);
        setMessage("Loading preview…");
        form.reset(); // Discard typed credentials before simulating an outcome.
        try {
          setMessage(authMessages[await previewAuthOutcome(outcome)]);
          onValid?.();
        } catch {
          setMessage(authMessages.unavailable);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="form-hint">
        Use invented details only. Do not enter a real password.
      </p>
      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={`auth-${field.name}`}>{field.label}</label>
          <input
            id={`auth-${field.name}`}
            name={field.name}
            type={field.type ?? "text"}
            autoComplete={field.autoComplete ?? "off"}
            required
            maxLength={field.type === "password" ? 128 : 254}
            aria-invalid={Boolean(errors[field.name])}
            aria-describedby={
              errors[field.name] ? `error-${field.name}` : undefined
            }
          />
          {errors[field.name] && (
            <span className="field-error" id={`error-${field.name}`}>
              {errors[field.name]}
            </span>
          )}
        </div>
      ))}
      <button className="primary-button" disabled={busy} type="submit">
        {busy ? "Loading preview…" : "Validate preview"}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
