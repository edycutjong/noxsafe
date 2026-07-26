# Sponsor Defense: Why ONLY Nox (NoxSafe)

| # | Primitive | Where used | Without it |
|---|---|---|---|
| 1 | `Nox.select(ebool, a, b)` + `Nox.le/add` on `euint256` | encrypted budget-cap enforcement in `executePayroll` | cap checks need plaintext → the amounts leak, the whole product collapses |
| 2 | `Nox.allowPublicDecryption(okHandle)` | public cap-compliance audit without amount exposure | trusted attestor server publishing "trust me" booleans |
| 3 | `addViewer(handle, recipient/auditor)` per roster line | recipient-only + auditor-on-grant disclosure | off-chain disclosure DB + access server (custodial trust) |
| 4 | `setOperator(rail, uint48 expiry)` (ERC-7984 operator model) | time-bound, multisig-revocable payment authority — the trust story | ERC-20 infinite approve to a custom module (audit nightmare) |
| 5 | `encryptInput` concurrent (`Promise.all`) + `fromExternal` proofs | roster propose (N amounts, one UX beat) | client FHE + custom proof relayer |
| 6 | `ERC20ToERC7984Wrapper` (wrap/2-step unwrap) | float on/off ramp against unmodified USDC | custodial bridge |
| 7 | `viewACL` + `isViewer`/`isAllowed` live checks | /verify ACL inspector (judge-visible least-privilege) | unverifiable claims |
| 8 | `allow` (admin) vs `addViewer` (viewer) role split | compliance-officer (admin, can extend viewers) vs auditor (read-only) — the full role matrix as an org chart | roles collapse into one "trusted server" |

**Closing:** Take Nox out and NoxSafe needs an FHE coprocessor, a disclosure registry, a custodial payroll processor, and a bespoke audited Safe module — **four systems** — and the Safe's owners would still have to trust every one of them. With Nox, they approve one capped, expiring operator from the queue they already use.

## Why not the alternatives
- **Safe module + ZK:** proves without revealing, but can't do *governed revealing* (recipient/auditor viewers) nor ciphertext-state enforcement (`spent ≤ cap` on encrypted accumulator).
- **fhEVM chains:** payroll leaves Sepolia and Safe's deployment; brief demands layering on the existing protocol.
- **Custodial payroll SaaS:** solves privacy by abandoning the multisig — exactly what DAOs refuse.

## Honest limitations
1. Treasurer sees plaintext client-side (inherent to composing payroll).
2. Operator = any-amount authority until expiry (ERC-7984 semantics; mitigated via short expiry + float-only wrap; stated in demo).
3. Beta SDK 0.1.0-beta.13 pinned; frictions → graded feedback.md.
4. TEE/gateway availability dependency (status.noxprotocol.io cited).
