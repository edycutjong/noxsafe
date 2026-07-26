# NoxSafe — Builder Feedback on iExec Nox (ERC-7984 / TEE confidential contracts)

Dated findings from building confidential payroll rails on Nox. Each is something that cost time,
surprised us, or would help the next builder. SDK: `@iexec-nox/handle@0.1.0-beta.13`,
`@iexec-nox/nox-protocol-contracts@0.2.4`, `@iexec-nox/nox-confidential-contracts@0.2.2`, solc 0.8.35.

### 1. (2026-07-12) `Nox.toEuint256(0)` returns a PUBLIC handle — do not `allowThis` it, and it bypasses ACL
The typed zero handle (`HandleUtils.zeroHandle`) has the unique-attr bit cleared, so `isPublicHandle` is
true and every ACL gate short-circuits to "allowed". Our encrypted budget accumulator starts as
`toEuint256(0)`; the first `add(spent, amt)` produces a *unique* (confidential) handle which we then
`allowThis`. Trap avoided: calling `allow/allowThis/addViewer/allowPublicDecryption` on a public handle
**reverts** `PublicHandleACLForbidden`. Lesson: initialize encrypted accumulators as the typed zero and
only persist ACL after the first real operation. Would help: a one-line note in the ERC-7984 accumulator
docs. (Verified in `test/PayrollRail.rail.test.js` "initializes the encrypted spend accumulator".)

### 2. (2026-07-12) The Nox library silently no-ops ACL calls on public handles — good, but undocumented
`Nox.allow/allowThis/allowTransient` route through `_allowIfNotPublic`, which skips public handles, so
`allowThis(publicZero)` does *nothing* rather than reverting — whereas the raw
`INoxCompute.allow(publicHandle, ...)` **does** revert. The library wrapper and the raw protocol differ
in this exact case; we only found it by reading `Nox.sol`. Documenting "library guards public handles,
the protocol does not" would save a debugging session.

### 3. (2026-07-12) On-chain compute ops don't revert without a TEE — enabling free local unit tests
`NoxCompute.add/le/select/...` deterministically derive a result handle, grant the caller transient ACL,
and emit an event; the TEE computes the *plaintext* off-chain. That means the entire contract *logic*
(state machine, ACL grants, event emission, the `le→select→allowThis→allowTransient→transferFrom`
orchestration) is testable on a local Hardhat network with a faithful `NoxCompute` double, with ZERO gas.
Only plaintext-value assertions ("designer decrypts 4,200") need the live gateway. This unlocked 65
local contract tests. Would help enormously: **ship an official `MockNoxCompute` / hardhat plugin** for
local testing — we had to write our own (`contracts/test/MockNoxCompute.sol`, ~260 lines).

### 4. (2026-07-12) `Nox.noxComputeContract()` hardcodes `0x75C6…C685` for chainId 31337 — but nothing deploys it there
The library expects a NoxCompute at a fixed local address, yet the published packages ship no local
deployment/fixture to put one there. We deploy our double and `hardhat_setCode` its runtime to that
address (works cleanly because our double has no constructor state or immutables). A documented
"local dev" recipe (or the plugin above) would remove a real onboarding cliff for contract testing.

### 5. (2026-07-12) The push receiver-hook can't persist a received handle — operator-pull is the right rail primitive
Confirmed from the sibling NoxSend build and central to NoxSafe's design: an `IERC7984Receiver` hook does
NOT get ACL over the pushed handle, so `Nox.allowThis` reverts `UnauthorizedSender` — a push-funded
holding contract can't persist funds. NoxSafe therefore uses the **operator model** end-to-end
(`setOperator(rail, quarterEnd)` → `confidentialTransferFrom`), which the ERC-7984 base grants cleanly.
This is also the better trust story (time-bound + one-tx revocable), so the constraint pushed us toward
the right design. Worth a prominent "prefer operator-pull for holding contracts" doc note.

### 6. (2026-07-12) `le`+`select` beats `safeSub` for a public-cap "pay amt-or-zero" invariant (dated comparison)
We built both (`contracts/test/BudgetInvariantHarness.sol`, `test/PayrollRail.cap.test.js`).
`safeSub(cap, spent+amt)` gives a success flag that doubles as the cap check, but its numeric output is
the *remaining budget*, not the payout — so you still need a `select(ok, amt, 0)` to clamp. `le`+`select`
reaches the clamped payout in one comparison + one select and reads far more directly. Finding: for
budget-clamp semantics, `le`+`select` is the tighter primitive; `safeSub` shines when you actually want
the arithmetic result plus overflow detection (e.g. balance math), which is exactly where the ERC-7984
base uses it.

### 7. (2026-07-12) `TEEType` enum order ≠ intuition, and it's the handle's type byte
Byte [5] of a handle is `uint8(TEEType)`, and the enum is `Bool=0, Address=1, Bytes=2, String=3,
Uint8=4 … Uint256=35, Int8=36 …`. `uint256` is **35**, not 256/some power of two. Comparisons return a
`Bool`-typed (byte 5 = 0) handle. We had to read `TypeUtils.sol` to get this right in our double and in
the TS handle decoder. A published type-code table would be a nice addition to the SDK reference.

### 8. (2026-07-12) `validateInputProof` requires an app-bound gateway signature — great for prod, a wall for local
The proof is 137 bytes (`owner ∥ app ∥ createdAt ∥ 65-byte gateway sig`) and the app in the proof MUST
equal `msg.sender`. On Sepolia `encryptInput(amount,'uint256', <contract>)` produces it self-serve (no
API key/allowlist — confirmed). Locally there's no gateway, so our double relaxes the signature while
keeping the app/owner/handle checks. The app-binding requirement is easy to trip: encrypt bound to the
*rail* address, not the token, for roster inputs. A clearer error than a generic revert on app-mismatch
would help.

### 9. (2026-07-12) `confidentialTransferFrom(euint256)` needs the caller ACL-allowed for the amount AND operator status
The 3-arg (no-proof) overload requires both `Nox.isAllowed(amount, msg.sender)` and
`isOperator(from, msg.sender)`. Our rail computes `pay = select(...)` (gets transient ACL), then
`allowTransient(pay, address(cUSD))` before calling — miss either and it reverts. The two required
grants (rail-allowed on `pay`, token-allowed on `pay`) are subtle; a sequence diagram in the ERC-7984
docs for the operator-pull path would be gold.

### 10. (2026-07-12) The library resolves `bytes32(0)` operands to the typed zero handle — fresh balances "just work"
`_resolveUndefinedHandle` turns an uninitialized `euint256` (`bytes32(0)`) into `zeroHandle(type)` before
calling the protocol, so a first mint/transfer to an account with no balance handle doesn't revert with
`UndefinedHandle`. Good ergonomics, but it means `euint256.wrap(0)` and the typed zero handle are
*different* values that both mean "zero" — worth calling out, since equality checks against `bytes32(0)`
won't catch a typed zero.

### 11. (2026-07-12) `hardhat_setCode` relocation is exact only for stateless/immutable-free contracts
Our first instinct was to relocate the *real* NoxCompute to the local address, but it's a UUPS proxy with
initializer + ERC-7201 namespaced storage + a gateway config, none of which survives a code-only copy.
A purpose-built stateless double relocates perfectly. Generalizable lesson for anyone stubbing a
protocol contract locally: make the stub constructor-arg-free and storage-init-free.

### 12. (2026-07-12) `viaIR` is effectively required; stack-trace support on 0.8.35 is partial
The Nox libraries + our rail compile only with `viaIR: true` (deep stacks in `_updateWithOptimizedPrimitives`).
Hardhat also prints "Solidity 0.8.35 is not fully supported yet" and stack traces degrade. Everything
still compiles and runs; just budget for weaker revert-trace ergonomics on the newest solc the packages
pin. Pinning the toolchain (solc 0.8.35 + `viaIR` + optimizer 200) matched the packages cleanly.

### 13. (2026-07-12) Over-cap lines are on-chain-indistinguishable from payments — a privacy *feature*, but test it explicitly
Because an over-cap line transfers `select(false, amt, 0)` = encrypted zero via the same
`confidentialTransferFrom`, the tx, event, and calldata look identical to a real payout. This is the
point (no observer learns a line was rejected), but it means you can only verify enforcement via the
publicly-decryptable `ok` flag. We made every `ok` handle publicly decryptable and assert the
true×5/false×1 pattern on Sepolia — the enforcement is auditable without leaking a single amount.

### 14. (2026-07-12) Gateway ACL indexer lags the chain (~1s) — retry decrypt on a 403
Carried over and re-confirmed: right after a tx that grants a viewer, the gateway's ACL view can 403 for
~1s. A bounded retry (we use up to 18× with backoff) makes decrypt/publicDecrypt reliable. A documented
"index lag + retry" note in the SDK would preempt the "it works on the second run" confusion.

### 15. (2026-07-12) A publicly-decryptable handle with a deep dependency graph needs extra TEE settle time
Confirmed on the live Sepolia run through a real 2-of-3 Safe. Our per-line cap flag
`ok_i = le(add(spent_{i-1}, amt_i), cap)` for the LAST (over-cap) line depends on the entire encrypted
accumulator chain (every prior `add`/`select`). Immediately after `executePayroll`, `publicDecrypt(ok_last)`
briefly returned a not-yet-final `true`, while the shallow flags (`ok_0..ok_4`) were already correct — and
the *enforcement itself was already right* (the over-cap recipient received encrypted **0**). Waiting ~10–40s
(or reading the deepest handle last, with a bounded retry) settled it to the correct `false`. Takeaway for
builders: an on-chain op returns its handle instantly, but the gateway's plaintext for a **deep-dependency**
handle can lag the shallow ones; gate assertions on a stability/settle window, not just the first read. A
"handle computed / pending" status from the gateway would make this deterministic.

---

## What was excellent
- **Self-serve gateway** (no API key / allowlist / signup) — `encryptInput` against
  `gateway-testnets.noxprotocol.dev` needs only a funded EOA. This is the single biggest DX win.
- **`select`-based encrypted branching** makes the budget invariant a two-line, readable primitive.
- **The ACL role model** (transient / viewer / admin / public) maps 1:1 onto real product roles
  (rail / recipient+auditor / compliance-officer / public cap-compliance) — the protocol's access model
  *is* the org chart. We surface all five as product features.
- **The optimized ERC-7984 wrapper** worked unmodified as our confidential USD — layering privacy on an
  untouched ERC-20 is exactly the brief's promise, and it held.
