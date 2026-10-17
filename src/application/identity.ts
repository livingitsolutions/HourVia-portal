import { z } from 'zod';
import type { AuthenticatedPrincipal, GlobalIdentity, SessionIdentity, VerifiedIdentityAssertion } from '../domain/identity';
import { failure, success, type Result } from '../domain/result';
export interface AuthenticationProviderAdapter {
  verify(credential: string): Promise<Result<VerifiedIdentityAssertion>>;
}
export interface IdentityRepository {
  findByProvider(issuer: string, subject: string): Promise<GlobalIdentity | null>;
  findSession(id: string): Promise<SessionIdentity | null>;
}
const assertionSchema = z.object({ issuer: z.string().min(1), subject: z.string().min(1), audience: z.string().min(1), sessionId: z.string().min(1), issuedAt: z.number().finite(), expiresAt: z.number().finite() }).strict();
export interface PrincipalResolver { resolve(credential: unknown): Promise<Result<AuthenticatedPrincipal>> }
export const disabledPrincipalResolver: PrincipalResolver = { resolve: async () => failure('DISABLED') };
/** Server-only composition boundary. No adapter is wired in Sprint 1. Time values are epoch milliseconds. */
export function createPrincipalResolver(deps: { provider: AuthenticationProviderAdapter; identities: IdentityRepository; issuer: string; audience: string; now: () => number }): PrincipalResolver {
  return { async resolve(credential) {
    if (typeof credential !== 'string' || !credential.trim()) return failure('UNAUTHENTICATED');
    try {
      const verified = await deps.provider.verify(credential);
      if (!verified.ok) return failure('INVALID_SESSION');
      const parsed = assertionSchema.safeParse(verified.value);
      if (!parsed.success) return failure('INVALID_SESSION');
      const a = parsed.data; const now = deps.now();
      if (!Number.isFinite(now) || a.issuer !== deps.issuer || a.audience !== deps.audience || a.issuedAt > now || a.expiresAt <= a.issuedAt) return failure('INVALID_SESSION');
      if (a.expiresAt <= now) return failure('EXPIRED');
      const identity = await deps.identities.findByProvider(a.issuer, a.subject);
      const session = await deps.identities.findSession(a.sessionId);
      if (!identity || identity.status !== 'active' || !identity.id || !session || session.id !== a.sessionId || session.userId !== identity.id || session.issuer !== a.issuer || session.subject !== a.subject || !Number.isFinite(session.expiresAt)) return failure('INVALID_SESSION');
      if (session.revocation !== 'active') return failure('REVOKED');
      if (session.expiresAt <= now) return failure('EXPIRED');
      return success({ userId: identity.id, sessionId: session.id, expiresAt: Math.min(a.expiresAt, session.expiresAt) });
    } catch { return failure('UNAVAILABLE'); }
  } };
}
