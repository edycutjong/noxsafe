# NoxSafe — Contracts

Solidity sources for NoxSafe, compiled with **solc 0.8.35** via Hardhat. Confidential payroll is layered
on a Safe{Wallet} multisig and **unmodified** ERC-20s using the audited [iExec Nox](https://docs.iex.ec)
confidential-token library — neither Safe nor the underlying token is modified.

Live and source-verified on **Ethereum Sepolia** (chainId `11155111`):

| Contract | File | Sepolia address | Role |
|---|---|---|---|
| **PayrollRail** | [`PayrollRail.sol`](./PayrollRail.sol) | [`0xE7158d…70ED8`](https://sepolia.etherscan.io/address/0xE7158dAE72C94D6396ed73636d9E5Fe4B5370ED8#code) | confidential payroll rail (the novel surface) |
| **ConfidentialUSD** (cUSD) | [`ConfidentialUSD.sol`](./ConfidentialUSD.sol) | [`0x82C281…8991`](https://sepolia.etherscan.io/address/0x82C281D7403e44d61968c2F49751a56877468991#code) | 1:1 confidential ERC-7984 wrapper (shared) |
| **DemoUSD** (dUSD) | [`DemoUSD.sol`](./DemoUSD.sol) | [`0x486c4B…735C`](https://sepolia.etherscan.io/address/0x486c4B8009ACf0BfE26268512F27200e48BD735C#code) | unmodified underlying ERC-20 (shared) |

Governed by a real 2-of-3 **Safe** [`0x3Bd273…F9642`](https://sepolia.etherscan.io/address/0x3Bd273B4f90829C0fA5d2aFa296b02E2AFaF9642) (protocol-kit v8, unmodified Safe v1.4.1). Nox protocol: [`0x24ef36…77bf`](https://sepolia.etherscan.io/address/0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf).

`ConfidentialUSD.sol` / `DemoUSD.sol` are the ERC-7984 wrapper + demo ERC-20 skeleton ([`./ConfidentialUSD.sol`](./ConfidentialUSD.sol) · [`./DemoUSD.sol`](./DemoUSD.sol)); this folder's novel surface is **`PayrollRail.sol`**. See [`./test/`](./test) for Solidity test helpers.

---

## PayrollRail.sol — the novel contract

Confidential payroll rails for a Safe multisig, **without modifying Safe in any way**.

### Trust model — operator, not module
The rail holds **zero Safe execution rights**. It is a time-bound, revocable ERC-7984 *operator* on cUSD
(`cUSD.setOperator(rail, quarterEnd)`), granted/revoked by a normal multisig tx (`setOperator(rail, 0)`).
Worst-case blast radius is the wrapped payroll float — which the app sets equal to the approved cap, so
the worst case *is* the approved spend. The Safe's unwrapped USDC is untouchable.

### The encrypted budget invariant (the flagship trick)
The cap is **public** (DAOs publish budgets); line items are **private**. `_spent` is an encrypted
accumulator. Each payout computes entirely in encrypted space:
```
ok    = Nox.le(Nox.add(_spent, amt), toEuint256(cap));   // ebool
pay   = Nox.select(ok, amt, ZERO);                        // over-cap line pays encrypted zero
_spent = Nox.add(_spent, pay);
```
`Nox.allowPublicDecryption(ok)` lets **anyone** audit cap-compliance without seeing a single amount. An
over-cap line transfers **encrypted zero** — on-chain indistinguishable from a real payment.

### Roster lifecycle
```
configure (onlySafe) → proposeRoster (onlyTreasurer) → approveRoster (onlySafe multisig)
    → executePayroll (anyone, once approved) → [SETTLED]
```
Owners approve **who** gets paid + a **public cap** via a tamper-evident roster hash — **how much** stays
sealed.

### ACL roles (the org chart, provable on-chain)
| Role | Grant | Rights |
|---|---|---|
| recipient | `addViewer(line, recipient)` at propose | decrypt-only, exactly their own line |
| auditor | `grantAuditor` (multisig) → `addViewer` all | read-all, read-only |
| compliance officer | `grantOfficer` (multisig) → `allow` all | **ADMIN** (decrypt + extend viewers); irrevocable by design |
| public | `allowPublicDecryption(ok)` | anyone decrypts the cap-compliance flag |

### Cryptographic accounting proof
`proveSpendWithinBudget()` publishes a single public `ebool` = `le(_spent, cap)` — proves "total spend ≤
approved budget" while revealing **no line and not even the total**. The institutional headline.

---

## Build & verify

```bash
npm run compile            # solc 0.8.35
npm run test:all           # 65 Hardhat contract + 128 SDK unit tests
npm run deploy             # deploy PayrollRail (reuses live cUSD/DemoUSD)
npm run verify:contracts   # Etherscan source-verify (needs ETHERSCAN_API_KEY in .env)
```

License: MIT.
