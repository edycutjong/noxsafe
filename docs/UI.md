# UI: NoxSafe

## Design decisions
- **Two-context product:** the treasurer experience lives INSIDE app.safe.global (iframe, must respect Safe's chrome — light, dense, enterprise); the recipient/auditor portals are standalone (calmer, personal). Design both, visually related.
- **"Sealed line items" motif:** roster tables render amounts as locked pills `🔒 ••••`; recipient view unseals exactly one row; auditor view unseals all — the same table, three truths. This is the product in one visual.
- **Queue empathy:** the Safe-queue mock in the before/after exhibit is rendered faithfully so owners recognize their daily tool.
- **Theme:** institutional slate + emerald accents (`#0F172A` / `#10B981`), Safe-adjacent neutrality; violet `#8B5CF6` reserved for encrypted/TEE states.

## Screens (6)
1. **Safe App — Onboard** (iframe): budget cap + float auto-set to cap ("float = cap" badge, editable with a warning) + operator expiry → "Propose batch to signers" (4 decoded txs listed).
2. **Safe App — Roster builder**: CSV upload → table (recipient, ENS, sealed amount), cap meter (public cap vs encrypted spend note), "Encrypt & propose" with per-line encryption progress.
3. **Safe App — Roster status board**: DRAFT→PROPOSED→APPROVED→SETTLED rail per roster; approve deep-link into Safe queue.
4. **Recipient portal**: "You were paid" card → Decrypt (sign) → unseal animation; payout history; balance pill.
5. **Auditor portal**: grant status, decrypt-all table, `viewACL` chips per line, export note.
6. **/verify (judge page)**: live events, cap-compliance checks (`publicDecrypt(ok)` = true×5, false×1), contract cards, bench tiles, before/after exhibit toggle.

## Component list
`SafeBatchBuilder` · `RosterTable` (+`SealedCell` 3-state: sealed/mine/audit) · `CapMeter` · `StatusRail` · `DecryptCard` · `ACLChips` · `EventFeed` · `ExhibitToggle` (before/after queue) · `BenchStats`.

## Mockups
Stitch → `designs/` from `DESIGN_PROMPT.md` (SCAN_PATH mode); export brand PNGs per ASSET_BRIEF.md.
