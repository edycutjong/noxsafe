# NoxSafe — Demo Runbook

Two ways to see the whole thing: **local** (zero gas, no gateway) and **Sepolia** (funded, real gateway).
The `## ★ beat sheet` below is the shot list for the ≤4:00 submission video; sections A/B are how to run it.

## ★ The ≤4:00 demo beat sheet (magic moment at 1:45)

One continuous story on ONE real Safe — same queue, same signers, the salary leak surgically removed.
Timings match the submission script and sum to 4:00.

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:30 | **Hook.** Exhibit A: a normal ERC-20 payroll batch on a real Safe. *"Read the designer's salary — anyone can, forever."* | app.safe.global queue: five naked `transfer` amounts + Etherscan |
| 0:30–1:10 | **Onboard — Safe untouched.** The NoxSafe Safe App proposes ONE batch: `approve → wrap → setOperator(rail, quarterEnd) → configure(treasurer, cap)`. Two of three owners sign the familiar flow. | Safe App iframe inside app.safe.global; 2-of-3 signing |
| 1:10–1:45 | **Seal the roster.** Load the 6-line CSV; each amount encrypts in-browser (concurrent `encryptInput`); propose; owners approve the **roster hash + public cap** in the queue. | roster builder → queue item is a hash, no amounts |
| **➡ 1:45** | **★ THE MAGIC MOMENT.** Cut back to the Safe queue where five salaries used to sit — now only **sealed handles**. *"Same queue. Same signers. The amounts are just… gone."* The designer opens her portal, signs, and **4,200 cUSD** unseals — for her eyes only. | queue = sealed handles; recipient portal decrypt → **4,200** |
| 1:45–2:35 | **Execute on-chain.** `executePayroll` settles all six lines; Etherscan shows `Paid` events — handles only, no amounts. | live Sepolia tx + event log |
| 2:35–3:10 | **The kicker + the audit.** Auditor portal decrypts all six lines (**26,000** proposed, **24,000** actually paid). `/verify` cap checks decrypt to `true×5, false×1` — *"the over-cap line paid **encrypted zero**; nobody learned anything."* | auditor portal + `/verify` cap-flag strip |
| 3:10–3:45 | **Trust model.** Operator-not-module card; one `setOperator(rail, 0)` from the queue revokes; worst case = the approved cap. Show the revoke tx. | trust card + revoke tx on Etherscan |
| 3:45–4:00 | **Recap.** *"Safe unmodified. Amounts sealed. Governance intact."* Repo + Etherscan links. | title card |

> **Capture caveat (feedback #15) — protect the magic moment.** The over-cap line's `ok` flag depends on the
> whole encrypted accumulator chain and can briefly read a not-yet-final `true` for ~10–40s after `executePayroll`.
> **Film the `/verify` beat only after the flag settles to `false`** (the portal's bounded retry does this; read the
> deepest handle last) so the audit shows `true×5, false×1` — never a transient `true×6`. The enforcement itself is
> always correct on-chain (the over-cap recipient received encrypted **0**); it's only the *display* that lags.

## A. Local full-lifecycle demo (zero gas, ~1 min)

Proves deploy → onboarding batch → roster propose/approve/execute → auditor + officer grants →
accounting proof, entirely on a local Hardhat node with a faithful Nox compute double.

```bash
npm install
npm run compile
npm run node            # terminal 1 — local Hardhat node
npm run e2e:local       # terminal 2 — full lifecycle, asserts the ACL org chart, writes fixtures
```

Everything the on-chain flow does is exercised; only the *plaintext values* are sealed locally (no TEE).
Also runnable as tests:

```bash
npm run test:all        # 65 contract tests (local) + 128 rail-sdk unit tests = 193 green
```

Offline CLI preview (the "sealed roster + live cap check" the video opens on):

```bash
npm run cli -- roster preview --csv fixtures/roster.csv --cap 25000
```

## B. Sepolia demo (funded run — real Nox gateway, zero mocks)

> Uses the already-live shared DemoUSD + cUSD; only PayrollRail is new.

```bash
# 1. Deploy the rail (reuses DemoUSD + cUSD). For the real multisig demo, pass the Safe address.
SAFE_ADDRESS=<demoSafe> npm run deploy          # or omit SAFE_ADDRESS to use the deployer as an EOA-Safe
npm run verify:contracts                         # Etherscan source-verify the rail

# 2. Full end-to-end proof on live Sepolia (encrypt, propose, approve, execute, decrypt, audit).
npm run e2e                                      # asserts: designer decrypts 4,200; cap flags true×5+false×1
npm run bench                                    # roster×10 encrypt wall-time + per-payout gas + decrypt p50/p95
npm run seed                                     # deterministic fixtures (SEED_LIVE=1 also creates the 2-of-3 Safe)
npm run check-readiness                          # offline submission gate
```

Estimated Sepolia ETH for the whole funded run: **~0.02–0.03 ETH** (1 rail deploy + ~15 lifecycle txs;
DemoUSD + cUSD are reused, not redeployed).

## The demo Safe (real protocol UI)

The submission demo runs the SAME onboarding batch and roster approvals **inside app.safe.global** against
a real 2-of-3 Safe (created via `SEED_LIVE=1 npm run seed`, or from the Safe UI). The Safe App proposes
`approve → wrap → setOperator(rail, quarterEnd) → configure(treasurer, cap)` as ONE queue item; owners
sign the familiar flow. `approveRoster` and `grantAuditor` arrive as normal multisig txs from the queue.
The Safe's own contracts are never modified.

## The ONE devastating beat (for the video)

> "Open this Safe's transaction queue and tell me what the designer earns."

- **Exhibit A (before):** a normal ERC-20 payout batch on the same Safe — five `transfer` rows, amounts
  naked in the queue and on Etherscan forever.
- **Exhibit B (NoxSafe):** the queue shows `approve / wrap / setOperator / approveRoster(#1)` — **not one
  amount anywhere.** The designer logs in, signs, and *only she* sees **4,200 cUSD**. The auditor logs in
  and sees all **six** lines (the five salaries + the over-cap probe). On `/verify`, the cap checks decrypt
  to `true,true,true,true,true,false` — the over-cap line paid encrypted zero and nobody learned anything.

Same governance flow. Leak surgically removed.
