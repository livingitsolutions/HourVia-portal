export interface GlobalIdentity { readonly id: string; readonly status: 'active' | 'disabled' }
/** Only a trusted server adapter may produce this after signature, issuer and audience verification. */
export interface VerifiedIdentityAssertion {
  readonly issuer: string; readonly subject: string; readonly audience: string;
  readonly sessionId: string; readonly issuedAt: number; readonly expiresAt: number;
}
export interface SessionIdentity {
  readonly id: string; readonly userId: string; readonly issuer: string; readonly subject: string;
  readonly expiresAt: number; readonly revocation: 'active' | 'revoked';
}
export interface AuthenticatedPrincipal { readonly userId: string; readonly sessionId: string; readonly expiresAt: number }
