import { expect, it } from 'vitest';
// Plain JS gate is also usable by the manual Node runner without a transpiler.
// @ts-expect-error Deliberately standalone .mjs test harness.
import { authorizeDisposable } from './disposable-gate.mjs';
const name = 'hourvia_disposable_offline001';
const target = `postgresql://localhost/${name}`;
const args = [`--authorize-disposable=${name}`, '--authorize-isolated-cluster', '--apply-quarantined-candidates', '--require-cluster-teardown'];
it('requires exact database and cluster authorization plus candidate application opt-in', () => {
  expect(authorizeDisposable(target, args, undefined)).toBe(name);
  for (let i = 0; i < args.length; i++) expect(() => authorizeDisposable(target, args.filter((_, n) => n !== i), undefined)).toThrow();
});
it.each([undefined, 'invalid', 'postgresql://remote.example.invalid/' + name, 'postgresql://localhost/production', 'postgresql://localhost/' + name + '?host=remote.example.invalid', 'postgresql://localhost/' + name + '#fragment'])('rejects absent, remote, ambiguous or protected targets %#', value => {
  expect(() => authorizeDisposable(value, args, undefined)).toThrow();
});
it('rejects inherited serverless transport without connecting', () => { expect(() => authorizeDisposable(target, args, 'serverless')).toThrow(); });

it.each(['production', 'staging', 'prod', 'stage'])('rejects protected labels even with matching flags: %s', label => {
  const protectedName = `hourvia_disposable_${label}_offline001`;
  expect(() => authorizeDisposable(`postgresql://localhost/${protectedName}`, [...args, `--authorize-disposable=${protectedName}`], undefined)).toThrow();
});
