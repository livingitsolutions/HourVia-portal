import { expect, it } from 'vitest';
import { inputDigest, replayDecision, validateClaim, type IdempotencyClaim } from '../idempotency';
const actorId = '11111111-1111-4111-8111-111111111111';
const claim: IdempotencyClaim = { actorId, organizationId: null, operation: 'provision', key: 'request_00000001', inputDigest: inputDigest({ name: 'Example' }) };
it('canonicalizes key order without changing values or array order', () => {
  expect(inputDigest({ a: 1, b: [2, 3] })).toBe(inputDigest({ b: [2, 3], a: 1 }));
  expect(inputDigest([2, 3])).not.toBe(inputDigest([3, 2]));
});
it.each([undefined, NaN, Infinity, new Date(), { a: undefined }, new Array(1), { get a() { throw new Error('getter must not run'); } }])('rejects noncanonical data %#', value => { expect(() => inputDigest(value)).toThrow('INVALID_CANONICAL_INPUT'); });
it('rejects cycles with a depth bound', () => { const x: { self?: unknown } = {}; x.self = x; expect(() => inputDigest(x)).toThrow('INVALID_CANONICAL_INPUT'); });
it('requires creator scope for provisioning and tenant scope for other commands', () => {
  expect(() => validateClaim(claim)).not.toThrow();
  expect(() => validateClaim({ ...claim, operation: 'accept' })).toThrow();
  expect(() => validateClaim({ ...claim, organizationId: actorId })).toThrow();
  expect(() => validateClaim({ ...claim, organizationId: actorId, operation: 'transfer' })).not.toThrow();
});
it.each([{ key: 'short' }, { key: 'x'.repeat(129) }, { inputDigest: 'invalid' }, { actorId: 'browser-id' }])('rejects malformed keys/digests/identity %#', patch => { expect(() => validateClaim({ ...claim, ...patch })).toThrow(); });
it('distinguishes conflicting reuse, completed replay, and incomplete claims', () => {
  const stored = { inputDigest: claim.inputDigest, state: 'completed' as const, outcome: { organizationId: actorId } };
  expect(replayDecision(stored, claim.inputDigest)).toBe('replay');
  expect(replayDecision(stored, inputDigest({ name: 'Other' }))).toBe('conflict');
  expect(replayDecision({ ...stored, state: 'pending', outcome: null }, claim.inputDigest)).toBe('in_progress');
  expect(replayDecision({ ...stored, outcome: [] }, claim.inputDigest)).toBe('in_progress');
});
