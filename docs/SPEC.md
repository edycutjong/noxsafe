# NoxSafe — Protocol Spec & Invariants

A formal mini-spec for the `PayrollRail`. The rail is a **time-bound ERC-7984 operator** on a
confidential wrapper (cUSD), governed by a Safe multisig. It never holds Safe execution rights.

## State machine (per roster)

```
          proposeRoster            approveRoster            executePayroll
 (none) ───────────────▶ PROPOSED ───────────────▶ APPROVED ───────────────▶ SETTLED
        onlyTreasurer            onlySafe (multisig)        anyone (once approved)
```

- `None → Proposed`: `proposeRoster(recipients, handles, proofs)` — `onlyTreasurer`. Per line:
  `fromExternal` → `allowThis` → `addViewer(recipient)`; commits `rosterHash = keccak256(abi.encode(recipients, handleIds))`.
- `Proposed → Approved`: `approveRoster(id)` — `onlySafe`. Owners approve WHO + the public cap via the hash.
- `Approved → Settled`: `executePayroll(id)` — anyone. Per line the encrypted budget invariant runs and
  the payout is pulled from the Safe via `confidentialTransferFrom`.
- Illegal transitions revert `BadRosterState(id, have, want)`. A settled roster cannot re-execute.

## Encrypted budget invariant (executePayroll, per line)

```solidity
ebool  ok  = Nox.le(Nox.add(spent, amt), Nox.toEuint256(cap)); // cap is PUBLIC, amt is SEALED
euint256 pay = Nox.select(ok, amt, Nox.toEuint256(0));         // over-cap -> encrypted zero
spent = Nox.add(spent, pay); Nox.allowThis(spent);             // accumulator advances by pay only
Nox.allowPublicDecryption(ok);                                 // anyone can audit compliance
Nox.allowTransient(pay, address(cUSD));
cUSD.confidentialTransferFrom(safe, recipient, pay);           // operator-pull from the Safe
```

## Invariants

- **I1 — Bounded authority.** The rail is only ever an operator on cUSD until `until` (quarter-end), and is
  revocable with one `cUSD.setOperator(rail, 0)`. Worst-case blast radius = the wrapped float, which the
  app sets equal to the approved budget cap (float ≡ cap), so the worst case *is* the approved spend. The
  Safe's unwrapped USDC is unreachable by the rail. *(Tested: `Onboarding.integration.test.js` — the Safe
  keeps its unwrapped balance; revoke disables the rail.)*
- **I2 — Cap.** Σ payouts ≤ cap, enforced in encrypted space via `le`+`select`; the accumulator advances
  only by amounts that actually pay, so an over-cap line contributes encrypted zero. The per-line
  compliance flag is publicly decryptable; no amount is revealed. *(Tested: `roster.test.ts` capStatus
  truth-table; `e2e.mjs` asserts true×5 + false×1 on Sepolia.)*
- **I3 — Approval integrity.** The executed roster ≡ the approved `rosterHash`; amounts are sealed at
  propose-time and cannot change before execute. *(Tested: rail + `roster.test.ts` hash suites.)*
- **I4 — ACL exactness.** Each line handle is readable by exactly `{rail, recipient}` at propose, plus
  `{auditor}` (viewer) and/or `{officer}` (admin) only after an explicit multisig grant. A stranger can
  neither view nor access any line. *(Tested: `PayrollRail.rail.test.js` ACL-exactness suite +
  `e2e.local.mjs` step 3/5.)*

## Roles (the ACL org chart — all five demonstrated)

| Role | Grant | Capability |
|---|---|---|
| none (public) | — | sees only public metadata + publicly-decryptable cap flags |
| transient | auto (op output) | rail → token, single-tx, for the payout handle |
| viewer | `addViewer` | recipient (own line), auditor (all lines) — **decrypt-only** |
| admin | `allow` | compliance officer — **decrypt AND extend viewers; irrevocable by design** |
| public | `allowPublicDecryption` | anyone decrypts the cap-compliance ebool (never an amount) |

## Residual risks (stated honestly)

1. The treasurer sees plaintext amounts client-side (inherent to composing payroll).
2. The operator grant covers any amount until expiry (ERC-7984 semantics) — mitigated by short expiry +
   wrapping only the float (float ≡ cap).
3. The total wrapped float and recipient addresses are public; only line amounts are the protected asset.
4. TEE/gateway availability dependency; beta SDK `0.1.0-beta.13` pinned.
