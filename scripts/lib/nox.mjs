// Shared helpers for the standalone (ESM) NoxSafe scripts. Contracts are compiled by Hardhat; we load
// the artifacts and talk to a chain via ethers. Network is parametric: default Sepolia, or set
// RPC_URL=http://127.0.0.1:8545 (or pass --local) to target a local Hardhat node — free, zero gas.
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');

const LOCAL = process.argv.includes('--local') || process.env.NETWORK === 'local' || /127\.0\.0\.1|localhost/.test(process.env.RPC_URL || '');

export const RPC = process.env.RPC_URL || (LOCAL ? 'http://127.0.0.1:8545' : (process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'));
export const CHAIN_ID = LOCAL ? 31337 : 11155111;
export const IS_LOCAL = LOCAL;
// Nox compute contract (NoxCompute — TEE ACL + proof validation). CANONICAL EXTERNAL INFRA, not a
// NoxSafe-deployed contract, so it is pinned in code (never in deployments.json):
//   local  = 0x75C6…C685 — the deterministic address the Nox library resolves NoxCompute to on a
//            fresh Hardhat node (deploy.mjs hardhat_setCode-installs the MockNoxCompute double here).
//   sepolia = 0x24ef…77bf — the iExec Nox protocol contract on Sepolia (env-overridable).
export const NOX_PROTOCOL = LOCAL
  ? '0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685'
  : (process.env.NOX_PROTOCOL_ADDRESS || '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf');

const rawPk = process.env.DEPLOYER_PRIVATE_KEY || '';
export const DEPLOYER_PK = rawPk ? (rawPk.startsWith('0x') ? rawPk : '0x' + rawPk) : '';

// Already-live shared skeleton on Sepolia — REUSED (do NOT redeploy). These are NoxSafe's OWN deployed
// contracts, so deployments.json (committed) is the single source of truth — read from it instead of
// duplicating literals here. An env var (DEMO_USD_ADDRESS / CUSD_ADDRESS) overrides for a re-pointed
// skeleton. Only consulted on the Sepolia path; local runs deploy a fresh stack.
function sepoliaContractAddress(name, envVar) {
  const override = process.env[envVar];
  if (override) return override;
  const p = join(ROOT, 'deployments.json'); // always the Sepolia file (never deployments.local.json)
  if (existsSync(p)) {
    const addr = JSON.parse(readFileSync(p, 'utf8'))?.contracts?.[name]?.address;
    if (addr) return addr;
  }
  return undefined;
}
export const SEPOLIA_SHARED = {
  DemoUSD: sepoliaContractAddress('DemoUSD', 'DEMO_USD_ADDRESS'),
  ConfidentialUSD: sepoliaContractAddress('ConfidentialUSD', 'CUSD_ADDRESS'),
};

export function provider() {
  return new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
}

export function deployer(p = provider()) {
  let base;
  if (IS_LOCAL) {
    // Hardhat account #0 (well-known local mnemonic) — pre-funded, ephemeral.
    base = ethers.Wallet.fromPhrase('test test test test test test test test test test test junk', p);
  } else {
    if (!DEPLOYER_PK) throw new Error('DEPLOYER_PRIVATE_KEY missing in .env');
    base = new ethers.Wallet(DEPLOYER_PK, p);
  }
  // NonceManager keeps sequential deploys/txs from one signer from racing the pending-nonce lookup.
  const signer = new ethers.NonceManager(base);
  signer.address = base.address; // convenience for scripts that read `.address`
  return signer;
}

export function artifact(name) {
  // contracts live at contracts/<Name>.sol or contracts/test/<Name>.sol
  for (const sub of ['', 'test/']) {
    const path = join(ROOT, 'artifacts', 'contracts', `${sub}${name}.sol`, `${name}.json`);
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  }
  throw new Error(`artifact ${name} not found — run: npm run compile`);
}

export function deploymentsPath() {
  return join(ROOT, IS_LOCAL ? 'deployments.local.json' : 'deployments.json');
}

export function readDeployments() {
  const p = deploymentsPath();
  if (!existsSync(p)) return { chainId: CHAIN_ID, network: IS_LOCAL ? 'localhost' : 'sepolia', contracts: {} };
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function writeDeployments(d) {
  writeFileSync(deploymentsPath(), JSON.stringify(d, null, 2) + '\n');
}

export function etherscanTx(hash) {
  return IS_LOCAL ? `(local) ${hash}` : `https://sepolia.etherscan.io/tx/${hash}`;
}
export function etherscanAddr(addr) {
  return IS_LOCAL ? `(local) ${addr}` : `https://sepolia.etherscan.io/address/${addr}`;
}

// Lazily import the ESM-only Nox handle SDK (used only against the live Sepolia gateway).
export async function handleClient(signer) {
  const { createEthersHandleClient } = await import('@iexec-nox/handle');
  return createEthersHandleClient(signer);
}

export const ZERO_HANDLE = '0x' + '0'.repeat(64);

// The gateway's ACL view lags the chain by a few seconds after a tx (indexer catch-up), and the TEE
// needs a moment to compute a fresh handle. Both surface as retryable errors.
const RETRYABLE = /not yet computed|not a viewer|access denied|not authorized|does not exist|rpc error|status: 403|status: 404|fetch failed|network request failed/i;

export async function decryptWithRetry(client, handle, { label = 'decrypt', attempts = 18, delayMs = 4000 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await client.decrypt(handle); }
    catch (e) {
      last = e;
      if (i === attempts || !RETRYABLE.test(e?.message || '')) throw e;
      process.stdout.write(`    (${label}: gateway/TEE catching up, retry ${i}/${attempts})   \r`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

export async function publicDecryptWithRetry(client, handle, { attempts = 18, delayMs = 4000 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await client.publicDecrypt(handle); }
    catch (e) {
      last = e;
      if (i === attempts || !RETRYABLE.test(e?.message || '')) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

// Deterministic demo cast from a DEDICATED throwaway mnemonic (never the public test mnemonic).
// Owner-1 doubles as the treasurer. 5 contributors + auditor + officer.
export function demoActors(p) {
  const phrase = process.env.DEMO_MNEMONIC || 'salmon banner pull inherit obey run shy treat embody joke rubber connect';
  const m = ethers.Mnemonic.fromPhrase(phrase);
  const at = (i) => new ethers.Wallet(ethers.HDNodeWallet.fromMnemonic(m, `m/44'/60'/0'/0/${i}`).privateKey, p);
  return {
    owner1: at(1), owner2: at(2), owner3: at(3),
    dev: at(4), designer: at(5), writer: at(6), ops: at(7), advisor: at(8),
    auditor: at(9), officer: at(10), stranger: at(11),
  };
}

export const USDC_DECIMALS = 6;
export const usd = (n) => ethers.parseUnits(String(n), USDC_DECIMALS);
export const fmtUsd = (v) => ethers.formatUnits(v, USDC_DECIMALS);

// Pinned Circle USDC on Ethereum Sepolia (documented primary asset; demo uses DemoUSD so judges are
// never blocked by a dry Circle faucet). Re-verify at build from circle.com/developers.
export const CIRCLE_USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

// The deterministic seed roster (SEED_DATA.md) — the single source for CLI, video, README, tests.
export const SEED_ROSTER = [
  { name: 'Dev', key: 'dev', amount: 12000 },
  { name: 'Designer', key: 'designer', amount: 4200 },
  { name: 'Writer', key: 'writer', amount: 1800 },
  { name: 'Ops', key: 'ops', amount: 3500 },
  { name: 'Advisor', key: 'advisor', amount: 2500 },
];
export const SEED_CAP = 25000;
export const SEED_FLOAT = 25000; // float == cap (blast radius == approved spend)
export const OVER_CAP_PROBE = { name: 'Probe', key: 'stranger', amount: 2000 }; // 6th line breaches the cap
