import { describe, expect, it } from 'vitest';
import { belongsToOrganization, hasExactlyOneOwner, type Membership } from './organization';
const owner: Membership = { organizationId: 'org-a', userId: 'user-a', role: 'OWNER' };
describe('organization invariants', () => {
  it('requires exactly one owner within the organization', () => {
    expect(hasExactlyOneOwner([], 'org-a')).toBe(false);
    expect(hasExactlyOneOwner([owner], 'org-a')).toBe(true);
    expect(hasExactlyOneOwner([owner, { ...owner, userId: 'user-b' }], 'org-a')).toBe(false);
    expect(hasExactlyOneOwner([owner, { ...owner, organizationId: 'org-b' }], 'org-a')).toBe(true);
  });
  it('requires both actor and organization to match', () => {
    expect(belongsToOrganization(owner, { actorId: 'user-a', organizationId: 'org-a' })).toBe(true);
    expect(belongsToOrganization(owner, { actorId: 'user-a', organizationId: 'org-b' })).toBe(false);
    expect(belongsToOrganization(owner, { actorId: 'user-b', organizationId: 'org-a' })).toBe(false);
  });
});
