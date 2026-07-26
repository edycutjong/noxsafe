import { describe, it, expect } from 'vitest';
import {
  ACL_MATRIX, ACL_ROLES, ACL_CAPABILITIES, can, rolesThatCan, roleLabel,
  classifyRole, describeViewAcl, type AclRole, type AclCapability,
} from '../src/acl.js';

// The canonical truth-table: role x capability -> expected.
const EXPECTED: Record<AclRole, Record<AclCapability, boolean>> = {
  none: { read: false, compute: false, grant: false },
  viewer: { read: true, compute: false, grant: false },
  admin: { read: true, compute: true, grant: true },
  transient: { read: false, compute: true, grant: false },
  public: { read: true, compute: true, grant: false },
};

describe('ACL truth-table (5 roles x 3 capabilities)', () => {
  for (const role of ACL_ROLES) {
    for (const cap of ACL_CAPABILITIES) {
      it(`${role} can ${cap} => ${EXPECTED[role][cap]}`, () => {
        expect(can(role, cap)).toBe(EXPECTED[role][cap]);
        expect(ACL_MATRIX[role][cap]).toBe(EXPECTED[role][cap]);
      });
    }
  }
});

describe('rolesThatCan', () => {
  it('read => viewer, admin, public', () => expect(rolesThatCan('read').sort()).toEqual(['admin', 'public', 'viewer']));
  it('compute => admin, transient, public', () => expect(rolesThatCan('compute').sort()).toEqual(['admin', 'public', 'transient']));
  it('grant => admin only', () => expect(rolesThatCan('grant')).toEqual(['admin']));
});

describe('classifyRole precedence', () => {
  it('public wins over everything', () => expect(classifyRole({ isPublic: true, isAdmin: true, isViewer: true })).toBe('public'));
  it('admin wins over viewer', () => expect(classifyRole({ isPublic: false, isAdmin: true, isViewer: true })).toBe('admin'));
  it('viewer when only viewer', () => expect(classifyRole({ isPublic: false, isAdmin: false, isViewer: true })).toBe('viewer'));
  it('transient when only transient', () => expect(classifyRole({ isPublic: false, isAdmin: false, isViewer: false, isTransient: true })).toBe('transient'));
  it('none when nothing', () => expect(classifyRole({ isPublic: false, isAdmin: false, isViewer: false })).toBe('none'));
});

describe('roleLabel', () => {
  it('admin label flags irrevocability', () => expect(roleLabel('admin')).toMatch(/irrevocable/i));
  it('public label flags irreversibility', () => expect(roleLabel('public')).toMatch(/irreversible/i));
  it('viewer label says decrypt-only', () => expect(roleLabel('viewer')).toMatch(/decrypt-only/i));
  it('every role has a non-empty label', () => ACL_ROLES.forEach((r) => expect(roleLabel(r).length).toBeGreaterThan(0)));
});

describe('describeViewAcl', () => {
  it('splits admins and viewers', () => {
    const r = describeViewAcl({ isPublic: false, admins: ['0xAAA'], viewers: ['0xBBB'] });
    expect(r.isPublic).toBe(false);
    expect(r.entries).toContainEqual({ address: '0xaaa', role: 'admin' });
    expect(r.entries).toContainEqual({ address: '0xbbb', role: 'viewer' });
  });
  it('does not double-count an admin who is also listed as viewer', () => {
    const r = describeViewAcl({ admins: ['0xAbC'], viewers: ['0xabc'] });
    expect(r.entries.filter((e) => e.address === '0xabc')).toEqual([{ address: '0xabc', role: 'admin' }]);
  });
  it('flags public handles', () => expect(describeViewAcl({ isPublic: true }).isPublic).toBe(true));
  it('handles empty acl', () => expect(describeViewAcl({}).entries).toEqual([]));
});
