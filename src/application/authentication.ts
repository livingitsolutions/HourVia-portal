import { z } from "zod";
import type { AuthenticatedPrincipal } from "../domain/identity";
import { failure, type Result } from "../domain/result";
const email = z.email("Enter a valid email address.").max(254);
const password = z.string().min(12, "Use at least 12 characters.").max(128);
export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter a password.").max(128),
});
export const registrationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email,
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords must match.",
  });
export const recoverySchema = z.object({ email });
export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords must match.",
  });
/** Future trusted adapter port. Credentials must never be persisted or logged by presentation. */
export interface AuthenticationUseCases {
  register(
    input: z.infer<typeof registrationSchema>,
  ): Promise<Result<{ verificationRequired: boolean }>>;
  signIn(
    input: z.infer<typeof signInSchema>,
  ): Promise<Result<AuthenticatedPrincipal>>;
  signOut(): Promise<Result<void>>;
  requestRecovery(input: z.infer<typeof recoverySchema>): Promise<Result<void>>;
  resetPassword(input: {
    credential: string;
    password: string;
  }): Promise<Result<void>>;
  verifyEmail(input: { credential: string }): Promise<Result<void>>;
  getSession(): Promise<Result<AuthenticatedPrincipal | null>>;
  expireSession(): Promise<Result<void>>;
}
const disabled = async () => failure("DISABLED");
export const disabledAuthentication: AuthenticationUseCases = {
  register: disabled,
  signIn: disabled,
  signOut: disabled,
  requestRecovery: disabled,
  resetPassword: disabled,
  verifyEmail: disabled,
  getSession: disabled,
  expireSession: disabled,
};
export const authMessages = {
  invalid: "Preview: invalid email or password. No sign-in attempt was made.",
  recovery:
    "Recovery preview complete. No email was sent. In live mode, the response must not reveal whether an account exists.",
  pending:
    "Email verification pending — preview only. No account was created and no email was sent.",
  verified: "Verified state preview. Your email has not been verified.",
  expired:
    "This session has expired. Sign in again to continue. Preview only; no live session existed.",
  unavailable: "Authentication is disabled. Nothing was sent or saved.",
} as const;
