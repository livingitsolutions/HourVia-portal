import type { AuthenticatedPrincipal, SessionIdentity, VerifiedIdentityAssertion } from '../domain/identity';
import type { PrincipalResolver } from './identity';
import { failure, type Result } from '../domain/result';

/** Browser projection only. It is never accepted as proof of authentication. */
export type AuthenticationState =
  | 'disabled' | 'signed-out' | 'callback-pending' | 'failed' | 'expired'
  | 'verification-pending' | 'organization-selection' | 'access-denied';
export interface ServerAuthentication {
  initiate(): Promise<Result<{ authorizationUrl: string }>>;
  callback(): Promise<Result<AuthenticationState>>;
  getSession(): Promise<Result<AuthenticationState>>;
  refresh(): Promise<Result<AuthenticationState>>;
  signOut(): Promise<Result<void>>;
  selectOrganization(organizationId: string): Promise<Result<{ organizationId: string }>>;
}
const disabled = async () => failure('DISABLED');
export const disabledServerAuthentication: ServerAuthentication = {
  initiate: disabled, callback: disabled, getSession: disabled,
  refresh: disabled, signOut: disabled, selectOrganization: disabled,
};

/** Server ports, not SDK interfaces. No implementation is composed in this sprint. */
export interface AuthorizationAttempt {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly challenge: string;
  readonly redirectUri: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly browserBindingDigest: string;
}
export interface AuthorizationAttemptStore {
  /** Durable atomic consume by state AND browser binding; every attempt is single-use, even on failure. */
  consume(state: string, browserBindingDigest: string): Promise<AuthorizationAttempt | null>;
  create(attempt: AuthorizationAttempt): Promise<void>;
}
export interface OidcProviderPort {
  /** A reviewed SDK must verify code + S256, nonce, signature, allowed algorithms, pinned issuer,
   * audience/azp, expiry and token type; refresh trusted JWKS on rotation with bounded retries.
   * Claims originate only from that verification. Never decode request JWTs as proof. */
  exchange(input: { code: string; attempt: AuthorizationAttempt }): Promise<Result<{ assertion: VerifiedIdentityAssertion; nonce: string }>>;
}
export interface SecureSessionStore {
  /** Atomically generate a fresh random opaque handle (store its digest), invalidate the old
   * handle, map verified issuer/subject to existing GlobalIdentity, and persist SessionIdentity.
   * Never adopt a browser-supplied session ID. No provider tokens may leave the server. */
  create(assertion: VerifiedIdentityAssertion, previousHandle: string | null): Promise<Result<{ handle: string; session: SessionIdentity }>>;
  /** Rotation must CAS against the old active session; concurrent reuse fails closed. */
  /** Refresh requires provider revalidation before extending lifetime; absolute expiry never slides. */
  rotate(handle: string): Promise<Result<{ handle: string; session: SessionIdentity }>>;
  revoke(handle: string): Promise<Result<void>>;
  expire(handle: string): Promise<Result<void>>;
}
export const disabledSecureSessionStore: SecureSessionStore = {
  create: disabled, rotate: disabled, revoke: disabled, expire: disabled,
};
export interface TrustedSessionBoundary extends PrincipalResolver {
  /** Opaque cookie only; revocation and expiry checked on EVERY resolution. */
  resolve(credential: unknown): Promise<Result<AuthenticatedPrincipal>>;
}
