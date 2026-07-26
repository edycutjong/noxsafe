// The ERC-7984 / Nox access-control model, made into a product surface.
//
// Five roles over an encrypted handle, and what each can do:
//   - none      : no access
//   - viewer    : decrypt-only (Nox.addViewer) — the auditor grant
//   - admin     : full — decrypt + compute + grant more viewers/admins (Nox.allow).
//                 NOTE: admin grants are IRREVOCABLE by design (revocation would be false security).
//   - transient : single-transaction compute only (Nox.allowTransient) — passing handles between contracts
//   - public    : anyone can decrypt + compute (Nox.allowPublicDecryption) — IRREVERSIBLE
//
// On-chain, an admin also passes `isViewer` (admins ⊇ viewers) and a public handle passes both.

export type AclRole = 'none' | 'viewer' | 'admin' | 'transient' | 'public';
export type AclCapability = 'read' | 'compute' | 'grant';

export const ACL_ROLES: readonly AclRole[] = ['none', 'viewer', 'admin', 'transient', 'public'] as const;
export const ACL_CAPABILITIES: readonly AclCapability[] = ['read', 'compute', 'grant'] as const;

/** Capability truth-table. `read` = can decrypt; `compute` = usable as an operand; `grant` = can add viewers/admins. */
export const ACL_MATRIX: Record<AclRole, Record<AclCapability, boolean>> = {
  none: { read: false, compute: false, grant: false },
  viewer: { read: true, compute: false, grant: false },
  admin: { read: true, compute: true, grant: true },
  transient: { read: false, compute: true, grant: false },
  public: { read: true, compute: true, grant: false }, // ACL mutations are forbidden on public handles
};

export function can(role: AclRole, capability: AclCapability): boolean {
  return ACL_MATRIX[role][capability];
}

export function rolesThatCan(capability: AclCapability): AclRole[] {
  return ACL_ROLES.filter((r) => can(r, capability));
}

/** Human label for a role, including the honesty caveats we surface in the UI. */
export function roleLabel(role: AclRole): string {
  switch (role) {
    case 'none': return 'No access';
    case 'viewer': return 'Viewer (decrypt-only)';
    case 'admin': return 'Admin (full — irrevocable by design)';
    case 'transient': return 'Transient (single-transaction)';
    case 'public': return 'Public (anyone can decrypt — irreversible)';
  }
}

/** Raw on-chain flags for (handle, account). */
export interface AclFlags {
  isPublic: boolean;
  isAdmin: boolean; // Nox.isAllowed persistent admin (allow)
  isViewer: boolean; // Nox.isViewer (viewer OR admin OR public)
  isTransient?: boolean; // same-tx only; usually not observable across calls
}

/** Collapse on-chain flags to the strongest applicable role. */
export function classifyRole(flags: AclFlags): AclRole {
  if (flags.isPublic) return 'public';
  if (flags.isAdmin) return 'admin';
  // A viewer that is not an admin/public is a decrypt-only grant.
  if (flags.isViewer) return 'viewer';
  if (flags.isTransient) return 'transient';
  return 'none';
}

export interface AclEntry {
  address: string;
  role: AclRole;
}

/** Shape returned by the SDK's viewACL, normalized into role entries for the /verify inspector. */
export interface ViewAclResult {
  isPublic?: boolean;
  admins?: string[];
  viewers?: string[];
}

export function describeViewAcl(acl: ViewAclResult): { isPublic: boolean; entries: AclEntry[] } {
  const isPublic = !!acl.isPublic;
  const admins = new Set((acl.admins ?? []).map((a) => a.toLowerCase()));
  const viewers = new Set((acl.viewers ?? []).map((a) => a.toLowerCase()));
  const entries: AclEntry[] = [];
  for (const a of admins) entries.push({ address: a, role: 'admin' });
  for (const v of viewers) if (!admins.has(v)) entries.push({ address: v, role: 'viewer' });
  return { isPublic, entries };
}
