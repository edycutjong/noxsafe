# Submission: NoxSafe

## Title
**NoxSafe — confidential payroll rails for Safe{Wallet}**

## Short description (≤150 chars)
Pay DAO contributors from your Safe with amounts encrypted end-to-end. Owners approve a cap, each recipient decrypts their own line. Sepolia, live.

## X post (THE official submission — tag @iEx_ec)
> Your Safe queue is a public salary spreadsheet. Every payout amount, readable by anyone, forever.
>
> NoxSafe fixes it without touching Safe: one multisig batch wraps the payroll float into confidential ERC-7984 (@iEx_ec Nox, Intel TDX) — owners approve a budget cap, contributors decrypt only their own line.
>
> 🎥 demo ↓ · 🔗 github.com/edycutjong/dorahacks-wtf-noxsafe · Safe App: noxsafe.edycu.dev
> Built for the WTF!! Hackathon @iEx_ec
*(attach ≤4-min video)*

## Long description (<500 words)
A DAO treasurer queues Q3 payroll in Safe — and every competitor, poacher, and salary-comparing teammate reads the exact numbers off the multisig queue before the second signature lands. Safe made treasuries trustworthy by making them transparent; for payroll, that transparency is the bug.

NoxSafe adds the missing privacy layer **without modifying Safe in any way** — the brief's exact constraint. Same Safe v1.4.1 contracts, same owners, same signing ritual. The integration is one familiar multisig batch: `approve → wrap (USDC→cUSD via ERC20ToERC7984Wrapper) → setOperator(rail, quarterEnd) → configure(treasurer, cap)`. From then on the PayrollRail is a **time-bound ERC-7984 operator** — it holds zero Safe execution rights, its worst-case blast radius is the wrapped float (which the app sets equal to the approved budget cap by default, so the worst case *is* the approved spend), and one `setOperator(rail, 0)` from the queue revokes it. That trust model is the institutional pitch: we didn't ask the Safe to trust a module with its treasury; we asked it to delegate a capped, expiring token authority.

The payroll flow: the treasurer encrypts each contributor's amount in-browser (`encryptInput`, concurrent) and proposes a roster; owners approve the **roster hash + a public budget cap** via the normal queue — WHO gets paid is governed, HOW MUCH stays sealed. `executePayroll` enforces the cap **in encrypted space**: `ok = le(add(spent, amt), cap)`; `pay = select(ok, amt, 0)` — an over-cap line transfers encrypted zero, indistinguishable on-chain from a payment, while `allowPublicDecryption(ok)` lets anyone audit compliance without seeing a single amount. Each recipient decrypts exactly their line (`addViewer`); a multisig-granted auditor can read them all. Our `/verify` page shows the live events, the cap checks decrypting to `true,true,true,true,true,false`, and the ACL of every handle.

**Why only Nox:** `select`-based encrypted enforcement, per-handle viewer ACLs for recipient/auditor disclosure, `setOperator`'s time-bound authority — ZK hides but can't governed-reveal or enforce-in-ciphertext against live state; FHE chains would mean leaving Sepolia and Safe behind. Remove Nox and you'd need an FHE coprocessor, a disclosure registry, a custodial payroll processor, and a custom Safe module audit — four systems and a worse trust story.

**Honest limitations:** the treasurer necessarily sees plaintext amounts client-side; the operator grant covers any amount until expiry (mitigated: short expiry, float-only wrapping); the total float and recipient addresses are public — line amounts are the protected asset; the JS SDK is beta 0.1.0-beta.13 (our friction log is the graded feedback.md).

Everything is open-source and reproducible from the README (~10 min incl. adding the Safe App to your own test Safe), deployed live on Sepolia, and benchmarked (`npm run bench`); the PayrollRail source verifies to Etherscan in one zero-gas command (`npm run verify:contracts`). Built solo during the hackathon; shared skeleton with my other WTF entries disclosed in the README; nothing reused from Vibe Coding.

Thank you for your time reviewing this project.

## Demo video script (hard cap 4:00)
- 0:00–0:30 Hook: real Safe queue, Exhibit A batch — "read the designer's salary. Everyone can." 
- 0:30–1:10 Inside app.safe.global: NoxSafe Safe App → onboarding batch → owners sign (2-of-3 shown signing).
- 1:10–1:45 Roster CSV → per-line encryption → propose → approve in queue → **queue shows zero amounts, just sealed handles**.
- 1:45 **★ magic moment**: the designer opens her portal, signs, and **4,200** unseals — for her eyes only, while the queue still shows nothing.
- 1:45–2:35 Execute; Etherscan live: `Paid` events, handles only.
- 2:35–3:10 Auditor portal: decrypt-all (**26,000** proposed, **24,000** paid). `/verify`: cap checks 5×true + 1×false — "the over-cap line paid encrypted zero; nobody learned anything."
- 3:10–4:00 Trust model card: operator-not-module, revoke tx shown. "Safe unmodified. Amounts sealed. Governance intact." Thanks + repo.
