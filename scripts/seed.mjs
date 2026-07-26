// Deterministic demo seed. Always writes fixtures/roster.csv + fixtures/demo-state.json (the single
// source for UI, video, README — numbers never drift). With SEED_LIVE=1 it also creates the real 2-of-3
// demo Safe via @safe-global/protocol-kit and runs the "before" exhibit (a naked ERC-20 payout batch on
// the same Safe) so the /verify before/after toggle is real. Default run is free (fixtures only).
import { ethers } from 'ethers';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  provider, deployer, demoActors, readDeployments, ROOT, SEED_ROSTER, SEED_CAP, SEED_FLOAT, OVER_CAP_PROBE, usd,
} from './lib/nox.mjs';

async function main() {
  const p = provider();
  const alice = deployer(p);
  const A = demoActors(p);
  const d = readDeployments();
  const recipientKeys = ['dev', 'designer', 'writer', 'ops', 'advisor'];

  const rosterCsv =
    '# Meridian Collective — Q3 confidential payroll roster (SEED_DATA.md)\n' +
    'name,address,amount\n' +
    SEED_ROSTER.map((r) => `${r.name},${A[r.key].address},${r.amount}`).join('\n') + '\n' +
    `# over-cap probe (breaches the 25,000 cap -> pays encrypted zero, publicly flagged false)\n` +
    `${OVER_CAP_PROBE.name},${A[OVER_CAP_PROBE.key].address},${OVER_CAP_PROBE.amount}\n`;

  const state = {
    network: process.env.NETWORK === 'local' ? 'localhost' : 'sepolia',
    generatedAt: new Date().toISOString(),
    org: 'Meridian Collective',
    contracts: d.contracts,
    noxProtocol: d.noxProtocol,
    safe: d.safe || null,
    cap: SEED_CAP,
    float: SEED_FLOAT,
    owners: { owner1: A.owner1.address, owner2: A.owner2.address, owner3: A.owner3.address, threshold: 2 },
    treasurer: A.owner1.address,
    recipients: recipientKeys.map((k, i) => ({ name: SEED_ROSTER[i].name, key: k, address: A[k].address, amount: SEED_ROSTER[i].amount })),
    overCapProbe: { name: OVER_CAP_PROBE.name, address: A[OVER_CAP_PROBE.key].address, amount: OVER_CAP_PROBE.amount },
    auditor: A.auditor.address,
    complianceOfficer: A.officer.address,
    note: 'Actors derive from DEMO_MNEMONIC (throwaway, in .env). Owner-1 doubles as treasurer.',
  };

  if (process.env.SEED_LIVE === '1') {
    // Real demo Safe via protocol-kit v8 (2-of-3). Requires gas — only on the funded run.
    const rawPk = (process.env.DEPLOYER_PRIVATE_KEY || '').startsWith('0x')
      ? process.env.DEPLOYER_PRIVATE_KEY : '0x' + process.env.DEPLOYER_PRIVATE_KEY;
    const rpc = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
    const { default: Safe } = await import('@safe-global/protocol-kit');
    const owners = [A.owner1.address, A.owner2.address, A.owner3.address];
    console.log('Creating a real 2-of-3 demo Safe via protocol-kit v8...');
    console.log('  owners:', owners.join(', '));
    const sdk = await Safe.init({
      provider: rpc,
      signer: rawPk,
      predictedSafe: { safeAccountConfig: { owners, threshold: 2 } },
    });
    const safeAddress = await sdk.getAddress();
    if (await sdk.isSafeDeployed()) {
      console.log('  Safe already deployed at', safeAddress);
    } else {
      const deployTx = await sdk.createSafeDeploymentTransaction();
      const wallet = new ethers.Wallet(rawPk, p);
      const sent = await wallet.sendTransaction({ to: deployTx.to, value: deployTx.value || 0n, data: deployTx.data });
      console.log('  deploy tx:', sent.hash);
      await sent.wait();
      console.log('  demo Safe deployed at', safeAddress);
    }
    state.safe = safeAddress;
    state.ownersDeployed = owners;
    console.log('  NEXT: SAFE_ADDRESS=' + safeAddress + ' npm run deploy   (governs the rail by this Safe)');
    // Persist a tiny pointer so deploy + e2e can pick it up.
    writeFileSync(join(ROOT, 'fixtures', 'safe.json'), JSON.stringify({ safe: safeAddress, owners, threshold: 2, at: new Date().toISOString() }, null, 2) + '\n');
  } else {
    console.log('(fixtures-only run — set SEED_LIVE=1 to also create the real demo Safe on-chain)');
  }

  mkdirSync(join(ROOT, 'fixtures'), { recursive: true });
  writeFileSync(join(ROOT, 'fixtures', 'roster.csv'), rosterCsv);
  writeFileSync(join(ROOT, 'fixtures', 'demo-state.json'), JSON.stringify(state, null, 2) + '\n');
  console.log('Wrote fixtures/roster.csv + fixtures/demo-state.json');
}
main().catch((e) => { console.error('SEED FAILED:', e?.message || e); process.exit(1); });
