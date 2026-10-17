import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthorizationAttempt, AuthorizationAttemptStore, OidcProviderPort } from '../src/application/server-authentication';
import type { VerifiedIdentityAssertion } from '../src/domain/identity';
import { failure, success, type Result } from '../src/domain/result';

export const stagingOrigin = 'https://hourvia-v3-staging.netlify.app';
export const callbackUri = `${stagingOrigin}/.netlify/functions/authentication/callback`;
export const sessionCookieName = '__Host-hourvia-session';
const opaque = /^[A-Za-z0-9_-]{43,128}$/;
const equal = (a: string, b: string) => {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export function sessionCookie(handle: string, maxAge = 900): string {
  if (!opaque.test(handle) || !Number.isInteger(maxAge) || maxAge < 0 || maxAge > 900) throw new Error('Invalid cookie policy');
  return `${sessionCookieName}=${handle}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export const clearSessionCookie = () => `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** Do not trust forwarded host/origin headers or wildcard deploy-preview domains. */
export function validRequest(request: Request, stateChanging: boolean, csrf?: { expected: string; supplied: string }): boolean {
  const url = new URL(request.url);
  if (url.origin !== stagingOrigin || (request.headers.has('host') && request.headers.get('host') !== url.host)) return false;
  const site = request.headers.get('sec-fetch-site');
  if (stateChanging) {
    if (request.headers.get('origin') !== stagingOrigin || (site && site !== 'same-origin')) return false;
    if (!csrf || !opaque.test(csrf.expected) || !opaque.test(csrf.supplied) || !equal(csrf.expected, csrf.supplied)) return false;
  }
  return true;
}

/** Additional orchestration checks, never a substitute for the reviewed SDK's verification.
 * This helper is not composed into the disabled handler. Store/SDK dependencies are trusted. */
export async function validateCallback(deps: {
  attempts: AuthorizationAttemptStore; provider: OidcProviderPort; now: () => number;
  issuer: string; audience: string;
}, input: { state: string; browserBindingDigest: string; code: string; redirectUri: string }): Promise<Result<VerifiedIdentityAssertion>> {
  try {
    if (!opaque.test(input.state) || !opaque.test(input.browserBindingDigest) || !input.code || input.code.length > 4096 || input.redirectUri !== callbackUri) return failure('INVALID_SESSION');
    const attempt = await deps.attempts.consume(input.state, input.browserBindingDigest);
    if (!attempt || !validAttempt(attempt, input, deps.now())) return failure('INVALID_SESSION');
    const result = await deps.provider.exchange({ code: input.code, attempt });
    if (!result.ok) return failure('INVALID_SESSION');
    if (!result.value.nonce || !equal(result.value.nonce, attempt.nonce)) return failure('INVALID_SESSION');
    const a = result.value.assertion; const now = deps.now();
    if (!a || a.issuer !== deps.issuer || a.audience !== deps.audience || !a.subject || !a.sessionId ||
      !Number.isFinite(now) || !Number.isFinite(a.issuedAt) || !Number.isFinite(a.expiresAt) ||
      a.issuedAt > now || a.expiresAt <= now || a.expiresAt <= a.issuedAt) return failure('INVALID_SESSION');
    return success(a);
  } catch { return failure('UNAVAILABLE'); }
}
function validAttempt(a: AuthorizationAttempt, input: { state: string; browserBindingDigest: string; redirectUri: string }, now: number): boolean {
  return Number.isFinite(now) && Number.isFinite(a.createdAt) && Number.isFinite(a.expiresAt) &&
    a.createdAt <= now && a.expiresAt > now && a.expiresAt > a.createdAt && a.expiresAt - a.createdAt <= 300_000 &&
    opaque.test(a.state) && equal(a.state, input.state) && opaque.test(a.browserBindingDigest) && equal(a.browserBindingDigest, input.browserBindingDigest) &&
    opaque.test(a.nonce) && opaque.test(a.verifier) &&
    createHash('sha256').update(a.verifier).digest('base64url') === a.challenge &&
    a.redirectUri === callbackUri && a.redirectUri === input.redirectUri;
}

/** Hard disabled: no environment flag can activate credentials, SDKs, storage or business operations. */
export async function authenticationHandler(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
  const reply = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers });
  if (!validRequest(request, false)) return reply('FORBIDDEN', 403);
  const action = new URL(request.url).pathname.split('/').pop();
  const methods: Record<string, string> = { initiate: 'POST', callback: 'GET', session: 'GET', refresh: 'POST', 'sign-out': 'POST', 'select-organization': 'POST' };
  if (!action || !Object.hasOwn(methods, action)) return reply('NOT_FOUND', 404);
  if (request.method !== methods[action]) return reply('INVALID_INPUT', 405);
  // Disabled mutations never issue a CSRF token or establish a session. A live composition must
  // validate a session/attempt-bound synchronizer token with validRequest before any mutation.
  if (request.method === 'POST' && request.headers.get('origin') !== stagingOrigin) return reply('FORBIDDEN', 403);
  return reply('DISABLED', 503);
}
