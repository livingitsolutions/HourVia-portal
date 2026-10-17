import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { authenticationHandler, callbackUri, clearSessionCookie, sessionCookie, stagingOrigin, validRequest, validateCallback } from './authentication';
import { disabledServerAuthentication, disabledSecureSessionStore, type AuthorizationAttempt, type OidcProviderPort } from '../src/application/server-authentication';
import { success, failure } from '../src/domain/result';
const state = 's'.repeat(43), nonce = 'n'.repeat(43), verifier = 'v'.repeat(43), binding = 'b'.repeat(43);
function fixture() {
  const attempt: AuthorizationAttempt = { state, nonce, verifier, challenge: createHash('sha256').update(verifier).digest('base64url'), redirectUri: callbackUri, createdAt: 100, expiresAt: 300100, browserBindingDigest: binding };
  const assertion = { issuer: 'https://issuer.example', audience: 'hourvia', subject: 'subject', sessionId: 'provider-session', issuedAt: 100, expiresAt: 10000 };
  const exchange = vi.fn<OidcProviderPort['exchange']>().mockResolvedValue(success({ assertion, nonce }));
  let consumed = false;
  const consume = vi.fn(async (s: string, b: string) => { if (consumed || s !== state || b !== binding) return null; consumed = true; return attempt; });
  return { attempt, assertion, exchange, consume, deps: { attempts: { consume, create: async () => {} }, provider: { exchange }, now: () => 1000, issuer: assertion.issuer, audience: assertion.audience }, input: { state, browserBindingDigest: binding, code: 'synthetic-code', redirectUri: callbackUri } };
}
describe('offline callback orchestration (SDK verification is a controlled double)', () => {
  it('accepts only trusted adapter output and consumes attempts once', async () => {
    const f = fixture(); expect((await validateCallback(f.deps, f.input)).ok).toBe(true);
    expect((await validateCallback(f.deps, f.input)).ok).toBe(false); expect(f.exchange).toHaveBeenCalledTimes(1);
  });
  it.each(['state', 'browserBindingDigest', 'redirectUri'] as const)('rejects incorrect %s', async key => {
    const f = fixture(); expect((await validateCallback(f.deps, { ...f.input, [key]: 'x'.repeat(43) })).ok).toBe(false); expect(f.exchange).not.toHaveBeenCalled();
  });
  it.each(['nonce', 'verifier', 'challenge', 'redirectUri', 'state', 'browserBindingDigest'] as const)('rejects broken stored %s', async key => {
    const f = fixture(); Object.assign(f.attempt, { [key]: '' }); expect((await validateCallback(f.deps, f.input)).ok).toBe(false); expect(f.exchange).not.toHaveBeenCalled();
  });
  it.each([0, 300100, NaN, Infinity])('rejects expired/future/nonfinite clock %s', async now => {
    const f = fixture(); f.deps.now = () => now; expect((await validateCallback(f.deps, f.input)).ok).toBe(false);
  });
  it.each(['', 'wrong-nonce'])('rejects missing/mismatched verified nonce', async nonce => {
    const f = fixture(); f.exchange.mockResolvedValue(success({ assertion: f.assertion, nonce })); expect((await validateCallback(f.deps, f.input)).ok).toBe(false);
  });
  it.each(['issuer', 'audience', 'subject', 'sessionId'] as const)('rejects untrusted assertion %s', async key => {
    const f = fixture(); f.exchange.mockResolvedValue(success({ assertion: { ...f.assertion, [key]: '' }, nonce })); expect((await validateCallback(f.deps, f.input)).ok).toBe(false);
  });
  it('rejects SDK verification failures without exposing diagnostics', async () => {
    const f = fixture(); f.exchange.mockResolvedValue(failure('INVALID_SESSION')); expect(await validateCallback(f.deps, f.input)).toEqual(failure('INVALID_SESSION'));
    const g = fixture(); g.exchange.mockRejectedValue(new Error('synthetic-private-diagnostic')); expect(await validateCallback(g.deps, g.input)).toEqual(failure('UNAVAILABLE'));
  });
});
describe('session HTTP policy and disabled composition', () => {
  it('sets secure host-only cookie attributes and clears with identical scope', () => {
    expect(sessionCookie(state)).toBe(`__Host-hourvia-session=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900`);
    expect(clearSessionCookie()).toContain('Max-Age=0'); expect(clearSessionCookie()).not.toContain('Domain=');
    expect(() => sessionCookie('injected; Domain=example.com')).toThrow(); expect(() => sessionCookie(state, 901)).toThrow();
  });
  it('requires exact HTTPS host, origin and session-bound CSRF for changes', () => {
    const req = (origin = stagingOrigin, host = new URL(stagingOrigin).host) => new Request(`${stagingOrigin}/x`, { method: 'POST', headers: { origin, host } });
    expect(validRequest(req(), true)).toBe(false);
    expect(validRequest(req(), true, { expected: state, supplied: nonce })).toBe(false);
    expect(validRequest(req('https://evil.example'), true, { expected: state, supplied: state })).toBe(false);
    expect(validRequest(req(stagingOrigin, 'evil.example'), false)).toBe(false);
    expect(validRequest(req(), true, { expected: state, supplied: state })).toBe(true);
    expect(validRequest(new Request('http://hourvia-v3-staging.netlify.app/x'), false)).toBe(false);
  });
  it.each(['initiate', 'callback', 'session', 'refresh', 'sign-out', 'select-organization'])('keeps %s disabled and never adopts attacker cookies', async action => {
    const method = ['callback', 'session'].includes(action) ? 'GET' : 'POST';
    const response = await authenticationHandler(new Request(`${stagingOrigin}/.netlify/functions/authentication/${action}?code=synthetic-private-diagnostic`, { method, headers: { origin: stagingOrigin, cookie: '__Host-hourvia-session=attacker', authorization: 'Bearer untrusted' } }));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false, error: 'DISABLED' });
    expect(response.headers.get('set-cookie')).toBeNull(); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects invalid methods, origins and routes', async () => {
    expect((await authenticationHandler(new Request(`${stagingOrigin}/x/session`, { method: 'POST' }))).status).toBe(405);
    expect((await authenticationHandler(new Request(`${stagingOrigin}/x/initiate`, { method: 'POST' }))).status).toBe(403);
    expect((await authenticationHandler(new Request('https://evil.example/x/session'))).status).toBe(403);
    expect((await authenticationHandler(new Request(`${stagingOrigin}/x/unknown`))).status).toBe(404);
  });
  it('never creates or rotates an attacker-selected session while storage is disabled', async () => {
    const store = disabledSecureSessionStore; const f = fixture();
    for (const result of await Promise.all([store.create(f.assertion, 'attacker'), store.rotate('attacker'), store.revoke('attacker'), store.expire('attacker')])) expect(result).toEqual(failure('DISABLED'));
  });
  it('fails closed for every browser port', async () => {
    const a = disabledServerAuthentication;
    for (const result of await Promise.all([a.initiate(), a.callback(), a.getSession(), a.refresh(), a.signOut(), a.selectOrganization('other-tenant')])) expect(result).toEqual(failure('DISABLED'));
  });
});
