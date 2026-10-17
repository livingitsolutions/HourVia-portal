import { createHash } from 'node:crypto';
export type Operation = 'provision' | 'transfer' | 'membership' | 'invite' | 'accept';
export interface IdempotencyClaim { readonly actorId: string; readonly organizationId: string | null; readonly operation: Operation; readonly key: string; readonly inputDigest: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validateClaim(claim: IdempotencyClaim): void {
  if (!claim || typeof claim.actorId !== 'string' || typeof claim.key !== 'string' || typeof claim.inputDigest !== 'string' || !uuid.test(claim.actorId) || !/^[A-Za-z0-9_-]{16,128}$/.test(claim.key) || !/^[0-9a-f]{64}$/.test(claim.inputDigest) ||
    !['provision','transfer','membership','invite','accept'].includes(claim.operation) ||
    (claim.operation === 'provision' ? claim.organizationId !== null : typeof claim.organizationId !== 'string' || !uuid.test(claim.organizationId))) throw new Error('INVALID_IDEMPOTENCY_CLAIM');
}
/** Bounded canonical JSON only. Caller removes credentials and uses credential digests before hashing. */
export function inputDigest(input: unknown): string {
  let nodes = 0;
  function canonical(value: unknown, depth: number): string {
    if (++nodes > 10000 || depth > 32) throw new Error('INVALID_CANONICAL_INPUT');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value) && Array.from({ length: value.length }, (_, i) => i in value).every(Boolean)) return '[' + value.map(v => canonical(v, depth + 1)).join(',') + ']';
    if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype && Object.getOwnPropertySymbols(value).length === 0) {
      const entries = Object.getOwnPropertyDescriptors(value);
      return '{' + Object.keys(entries).sort().map(key => {
        const descriptor = entries[key];
        if (!('value' in descriptor) || !descriptor.enumerable) throw new Error('INVALID_CANONICAL_INPUT');
        return JSON.stringify(key) + ':' + canonical(descriptor.value, depth + 1);
      }).join(',') + '}';
    }
    throw new Error('INVALID_CANONICAL_INPUT');
  }
  return createHash('sha256').update(canonical(input, 0)).digest('hex');
}
export function replayDecision(stored: { inputDigest: string; state: 'pending' | 'completed'; outcome: unknown }, digest: string): 'conflict' | 'replay' | 'in_progress' {
  if (!/^[0-9a-f]{64}$/.test(digest) || stored.inputDigest !== digest) return 'conflict';
  return stored.state === 'completed' && stored.outcome !== null && typeof stored.outcome === 'object' && !Array.isArray(stored.outcome) ? 'replay' : 'in_progress';
}
