import { describe, expect, it, vi } from 'vitest';
import { createPrincipalResolver, disabledPrincipalResolver, type IdentityRepository } from './identity';
import type { VerifiedIdentityAssertion } from '../domain/identity';
import { success } from '../domain/result';
import { createAuthorizationEvaluator } from './authorization';
const assertion = { issuer: 'trusted', subject: 'subject', audience: 'hourvia', sessionId: 'session', issuedAt: 50, expiresAt: 200 };
const session = { id: 'session', userId: 'user', issuer: 'trusted', subject: 'subject', expiresAt: 190, revocation: 'active' as const };
function setup(value: unknown = assertion, repository?: Partial<IdentityRepository>) {
  const identities: IdentityRepository = { findByProvider: async () => ({ id: 'user', status: 'active' }), findSession: async () => session, ...repository };
  const provider = { verify: vi.fn(async () => success(value as VerifiedIdentityAssertion)) };
  return { provider, resolver: createPrincipalResolver({ provider, identities, issuer: 'trusted', audience: 'hourvia', now: () => 100 }) };
}
describe('trusted server principal resolution', () => {
  it('ships disabled regardless of browser assertions', async () => { expect(await disabledPrincipalResolver.resolve({ userId: 'owner', role: 'OWNER' })).toEqual({ ok: false, error: 'DISABLED' }); });
  it('derives identity only from trusted provider mapping and limits lifetime', async () => { expect(await setup().resolver.resolve('opaque')).toEqual(success({ userId: 'user', sessionId: 'session', expiresAt: 190 })); });
  it.each([null, undefined, '', ' ', { userId: 'user', role: 'OWNER' }])('rejects missing or client object credentials %s', async input => { const s = setup(); expect((await s.resolver.resolve(input)).ok).toBe(false); expect(s.provider.verify).not.toHaveBeenCalled(); });
  it.each([{}, { ...assertion, expiresAt: NaN }, { ...assertion, expiresAt: 40 }, { ...assertion, issuedAt: 101 }, { ...assertion, issuer: 'untrusted' }, { ...assertion, audience: 'other' }, { ...assertion, subject: '' }, { ...assertion, role: 'OWNER' }])('rejects malformed or untrusted assertion %#', async input => { expect((await setup(input).resolver.resolve('opaque')).ok).toBe(false); });
  it('rejects expiry at boundary', async () => { expect(await setup({ ...assertion, expiresAt: 100 }).resolver.resolve('opaque')).toEqual({ ok: false, error: 'EXPIRED' }); });
  it('rejects revoked, missing, expired and identity-mismatched sessions', async () => {
    for (const value of [null, { ...session, revocation: 'revoked' as const }, { ...session, expiresAt: 100 }, { ...session, userId: 'other' }, { ...session, subject: 'other' }, { ...session, id: 'other' }, { ...session, expiresAt: Infinity }]) expect((await setup(assertion, { findSession: async () => value }).resolver.resolve('opaque')).ok).toBe(false);
  });
  it('rejects disabled global identities and provider failures', async () => {
    expect((await setup(assertion, { findByProvider: async () => ({ id: 'user', status: 'disabled' }) }).resolver.resolve('opaque')).ok).toBe(false);
    expect(await setup(assertion, { findSession: async () => { throw new Error('offline'); } }).resolver.resolve('opaque')).toEqual({ ok: false, error: 'UNAVAILABLE' });
    const s = setup(); s.provider.verify.mockRejectedValueOnce(new Error('verification failure')); expect((await s.resolver.resolve('opaque')).ok).toBe(false);
  });
  it('blocks queries before authentication and fails closed on repository errors', async () => {
    const load = vi.fn(async () => { throw new Error('offline'); });
    const organizations = { load, listForUser: async () => [] };
    const input = { organizationId: 'a', resourceOrganizationId: 'a', permission: 'time.track' as const };
    expect((await createAuthorizationEvaluator({ principals: disabledPrincipalResolver, organizations, now: () => 100 })('opaque', input)).ok).toBe(false); expect(load).not.toHaveBeenCalled();
    expect(await createAuthorizationEvaluator({ principals: setup().resolver, organizations, now: () => 100 })('opaque', input)).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});
