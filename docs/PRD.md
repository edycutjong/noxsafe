# PRD: NoxSafe — Confidential Payroll Rails for Safe{Wallet}

> **Emotional Hook:** A DAO treasurer queues the Q3 contributor payroll in Safe — and every competitor, poacher, and salary-comparing teammate reads the exact numbers straight off the multisig queue before the second signature lands.

## Problem
Safe is the standard for DAO/startup treasuries (the multisig queue is the trust anchor), but it's radically transparent: every payout amount is public in the queue *before* execution and on-chain forever after. Result: contributor comp is public record → poaching lists, internal resentment, negotiation asymmetry. Teams either accept the leak or exfiltrate payroll to a custodial processor — abandoning the multisig guarantees they chose Safe for.

## Solution
NoxSafe keeps the Safe **exactly as it is** — same contracts, same owners, same signing queue — and routes only the *amounts* through Nox confidential tokens. One multisig batch wraps the payroll float (USDC→cUSD) and grants a **time-bound, revocable ERC-7984 operator** to the PayrollRail. Owners approve WHO gets paid and a **public budget cap**; individual amounts stay encrypted end-to-end, enforced against the cap *in encrypted space* (`le`+`select`), visible only to each recipient — and an auditor if the DAO chooses. Delivered as a **Safe App** that runs inside app.safe.global.

## Target Users
1. **DAO operations lead** — pays 5–50 contributors monthly, bleeding comp data.
2. **Startup treasury on Safe** — payroll privacy is a legal/HR requirement, multisig control non-negotiable.
3. **DAO auditor/accountant** — needs full visibility without publishing it.

## Core Features (MVP)
| # | Feature | Depth |
|---|---|---|
| 1 | Safe App (iframe in app.safe.global, Safe Apps SDK) | integration into the REAL protocol UI — the brief's ask |
| 2 | One-batch onboarding: approve→wrap→setOperator→configure | owners sign ONE familiar queue item; float ≡ cap by default |
| 3 | Encrypted roster propose/approve/execute | rosterHash approval; amounts never in queue |
| 4 | Encrypted budget-cap enforcement | `le`+`select`; over-cap pays encrypted zero; compliance ebool publicly decryptable |
| 5 | Recipient portal (decrypt own payout) | per-line `addViewer` |
| 6 | Auditor grant (view-all, read-only) | selective disclosure story |
| 7 | `/verify` judge page + before/after exhibit | zero mock (3⭐) |

## User Stories
- As a treasurer, I upload a 5-row roster CSV; owners see recipients + the 25,000 cap — never line amounts.
- As a Safe owner, I sign the same kind of queue item I always sign; my trust flow is unchanged.
- As a contributor, I open the portal, sign, and see my 4,200 — my teammates can't.
- As an auditor, I see every line after one on-chain grant; Etherscan still shows nothing.
- As the DAO, I revoke the rail with one `setOperator(rail, 0)` tx if I ever stop trusting it.

## Success Metrics
- Full quarter lifecycle (wrap→propose→approve→execute→decrypt→audit) live on Sepolia, zero mocks.
- Judge adds the Safe App to their own test Safe from the README in <10 min.
- ≥12 findings in `feedback.md`; bench table published.

## Out of Scope
- No Safe Module / `enableModule` / arbitrary execution rights (trust-surface decision, stated in pitch).
- Core is **discrete payroll rosters, not continuous streaming** — confidential **Sablier** streams are a deliberate, gated **v3 Tier-B extension** of the rail (the brief names Sablier), never the core flow; no fiat, no mainnet, no recipient-address privacy.
- No standalone payroll app UX — everything treasury-side lives inside the Safe App.

## Scope Constraint
**ONE core flow with extreme depth: multisig-governed confidential payroll roster (propose → approve → execute → decrypt/audit).** The four ACL roles exist to make that one flow undeniable.
