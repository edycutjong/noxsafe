// NoxSafe FULL-LIFECYCLE proof on a LOCAL Hardhat node — ZERO gas, no gateway.
// Deploy stack + local Nox double, run onboarding -> roster propose/approve/execute -> auditor + officer
// grants, and assert the ACL org chart structurally. This is the runnable proof that the whole pipeline
// works offline; the SAME flow runs against the real gateway on Sepolia via scripts/e2e.mjs (funded).
// Requires a local node: `npm run node` in another terminal (or the script prints how to start one).
import { ethers } from 'ethers';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  provider, deployer, artifact, NOX_PROTOCOL, usd, fmtUsd, ROOT,
  demoActors, SEED_ROSTER, SEED_CAP, SEED_FLOAT, OVER_CAP_PROBE,
} from './lib/nox.mjs';

const step = (n, s) => console.log(`\n=== [${n}] ${s} ===`);
const ok = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg); console.log('   ok:', msg); };

// Craft a well-formed ERC-7984 input handle (version/chainId/type/attr) + a non-empty proof.
function makeInput() {
  const b = ethers.getBytes(ethers.hexlify(ethers.randomBytes(32)));
  b[0] = 0; b[1] = 0; b[2] = 0; b[3] = 0x7a; b[4] = 0x69; b[5] = 35; b[6] = 1; // 31337 / Uint256 / unique
  return { handle: ethers.hexlify(b), proof: ethers.hexlify(ethers.randomBytes(137)) };
}

async function main() {
  const p = provider();
  await p.getBlockNumber().catch(() => {
    throw new Error('No local node at 127.0.0.1:8545. Start one with `npm run node`, then re-run `npm run e2e:local`.');
  });
  const w = deployer(p);
  const A = demoActors(p);
  const recipients = [A.dev, A.designer, A.writer, A.ops, A.advisor];

  step('0', 'Install local Nox compute double + deploy the stack (DemoUSD, cUSD, PayrollRail)');
  const mockArt = artifact('MockNoxCompute');
  const mock = await new ethers.ContractFactory(mockArt.abi, mockArt.bytecode, w).deploy();
  await mock.waitForDeployment();
  await p.send('hardhat_setCode', [NOX_PROTOCOL, await p.getCode(await mock.getAddress())]);
  const demo = await new ethers.ContractFactory(artifact('DemoUSD').abi, artifact('DemoUSD').bytecode, w).deploy();
  await demo.waitForDeployment();
  const cusd = await new ethers.ContractFactory(artifact('ConfidentialUSD').abi, artifact('ConfidentialUSD').bytecode, w).deploy(await demo.getAddress());
  await cusd.waitForDeployment();
  // The Safe here is the deployer EOA (local). On Sepolia this is the real 2-of-3 app.safe.global Safe.
  const rail = await new ethers.ContractFactory(artifact('PayrollRail').abi, artifact('PayrollRail').bytecode, w).deploy(await cusd.getAddress(), w.address);
  await rail.waitForDeployment();
  const nox = new ethers.Contract(NOX_PROTOCOL, [
    'function isViewer(bytes32,address) view returns (bool)',
    'function isAllowed(bytes32,address) view returns (bool)',
    'function isPubliclyDecryptable(bytes32) view returns (bool)',
  ], p);
  console.log('   rail:', await rail.getAddress(), '| cUSD:', await cusd.getAddress());

  const quarterEnd = (await p.getBlock('latest')).timestamp + 90 * 24 * 3600;

  step('1', 'Onboarding batch: approve -> wrap(float=cap) -> setOperator(rail, quarterEnd) -> configure');
  const usdBefore = await demo.balanceOf(w.address);
  await (await demo.approve(await cusd.getAddress(), usd(SEED_FLOAT))).wait();
  await (await cusd.wrap(w.address, usd(SEED_FLOAT))).wait();
  await (await cusd.setOperator(await rail.getAddress(), quarterEnd)).wait();
  await (await rail.configure(A.owner1.address, usd(SEED_CAP))).wait();
  ok(await rail.isActiveOperator(), 'rail is the active operator on cUSD');
  ok(await rail.configured(), 'rail configured (treasurer + public cap)');
  ok(usdBefore - (await demo.balanceOf(w.address)) === usd(SEED_FLOAT), 'only the 25,000 float left the Safe (rest of USDC untouched)');
  ok((await demo.balanceOf(await cusd.getAddress())) === usd(SEED_FLOAT), 'wrapper holds the float 1:1');

  step('2', 'Treasurer proposes the encrypted roster (5 lines + 1 over-cap probe = 6)');
  const lines = [...SEED_ROSTER, OVER_CAP_PROBE];
  const addrs = [...recipients.map((r) => r.address), A.stranger.address];
  const inputs = lines.map(() => makeInput());
  // Treasurer == owner1; fund owner1 with a little ETH, then propose as owner1.
  await (await w.sendTransaction({ to: A.owner1.address, value: ethers.parseEther('1') })).wait();
  const owner1Rail = rail.connect(A.owner1);
  const id = await owner1Rail.proposeRoster.staticCall(addrs, inputs.map((i) => i.handle), inputs.map((i) => i.proof));
  await (await owner1Rail.proposeRoster(addrs, inputs.map((i) => i.handle), inputs.map((i) => i.proof))).wait();
  ok(id === 1n, 'roster id == 1');
  ok((await rail.rosterStatus(1)) === 1n, 'status == PROPOSED');
  ok((await rail.rosterHash(1)) !== ethers.ZeroHash, 'roster hash committed (approval integrity)');

  step('3', 'ACL: each recipient views exactly their own line; a stranger views none');
  for (let i = 0; i < lines.length; i++) {
    const h = await rail.lineAmountHandle(1, i);
    ok(await nox.isViewer(h, addrs[i]), `line ${i}: recipient is a viewer`);
  }
  ok(!(await nox.isViewer(await rail.lineAmountHandle(1, 0), A.auditor.address)), 'auditor not yet a viewer');

  step('4', 'Owners approve the roster (multisig); execute settles it (operator-pull payouts)');
  await (await rail.approveRoster(1)).wait();
  ok((await rail.rosterStatus(1)) === 2n, 'status == APPROVED');
  await (await rail.executePayroll(1)).wait();
  ok((await rail.rosterStatus(1)) === 3n, 'status == SETTLED');
  for (let i = 0; i < lines.length; i++) {
    ok(await nox.isPubliclyDecryptable(await rail.lineOkHandle(1, i)), `line ${i}: cap-compliance flag is publicly decryptable`);
  }
  ok(await nox.isAllowed(await rail.spentHandle(), await rail.getAddress()), 'encrypted spend accumulator stays rail-owned');
  ok(!(await nox.isPubliclyDecryptable(await rail.spentHandle())), 'the total spend is NOT public (only the compliance flag is)');

  step('5', 'Disclosure: multisig grants an auditor (viewer, read-only) and an officer (admin)');
  await (await rail.grantAuditor(A.auditor.address)).wait();
  await (await rail.grantOfficer(A.officer.address)).wait();
  const l0 = await rail.lineAmountHandle(1, 0);
  ok(await nox.isViewer(l0, A.auditor.address), 'auditor is a viewer of every line');
  ok(!(await nox.isAllowed(l0, A.auditor.address)), 'auditor is read-only (not admin)');
  ok(await nox.isAllowed(l0, A.officer.address), 'officer is an ADMIN (decrypt + grant)');

  step('6', 'Cryptographic accounting proof: "spend <= budget" as one public ebool');
  const okHandle = await rail.proveSpendWithinBudget.staticCall();
  await (await rail.proveSpendWithinBudget()).wait();
  ok(await nox.isPubliclyDecryptable(okHandle), 'budget-compliance flag published (reveals no line, not the total)');

  mkdirSync(join(ROOT, 'fixtures'), { recursive: true });
  writeFileSync(join(ROOT, 'fixtures', 'demo-state.local.json'), JSON.stringify({
    network: 'localhost', at: new Date().toISOString(),
    rail: await rail.getAddress(), cUSD: await cusd.getAddress(), demoUSD: await demo.getAddress(),
    safe: w.address, treasurer: A.owner1.address, auditor: A.auditor.address, officer: A.officer.address,
    roster: { id: 1, lines: lines.map((l, i) => ({ ...l, recipient: addrs[i] })), cap: SEED_CAP, float: SEED_FLOAT },
  }, null, 2) + '\n');

  console.log('\nALL LIFECYCLE STEPS GREEN (local, zero gas). fixtures/demo-state.local.json written.');
  console.log('Note: line AMOUNTS are structurally sealed here (no local TEE). Plaintext values —');
  console.log('"designer decrypts 4,200", cap checks true x5 + false x1 — are asserted on Sepolia by scripts/e2e.mjs.');
}

main().catch((e) => { console.error('\nLOCAL E2E FAILED:', e?.message || e); process.exit(1); });
