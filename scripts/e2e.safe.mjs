// NoxSafe FULL LIVE e2e on Sepolia, governed by a REAL 2-of-3 Safe (protocol-kit).
// Onboarding batch + approveRoster + grantAuditor are routed through the Safe multisig (owner1 + owner2
// sign off-chain, the funded deployer executes). proposeRoster is the treasurer (owner1); executePayroll
// is anyone. Asserts on-chain via the real Nox gateway: designer decrypts 4,200, cap flags true×5+false×1.
import { ethers } from 'ethers';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  provider, artifact, readDeployments, handleClient, usd, fmtUsd, etherscanTx, ROOT,
  decryptWithRetry, publicDecryptWithRetry, demoActors, SEED_ROSTER, SEED_CAP, SEED_FLOAT, OVER_CAP_PROBE, NOX_PROTOCOL,
} from './lib/nox.mjs';

const step = (n, s) => console.log(`\n=== [${n}] ${s} ===`);
const expect = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg); };
const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const pk = (w) => (process.env.DEPLOYER_PRIVATE_KEY.startsWith('0x') ? process.env.DEPLOYER_PRIVATE_KEY : '0x' + process.env.DEPLOYER_PRIVATE_KEY);

async function main() {
  const p = provider();
  const rawDeployerPk = pk();
  const deployer = new ethers.Wallet(rawDeployerPk, p);
  const A = demoActors(p);
  const d = readDeployments();
  const safeAddr = d.safe;
  const railAddr = d.contracts.PayrollRail.address;
  if (!safeAddr || !railAddr) throw new Error('Need deployments.json with safe + PayrollRail (run seed + deploy)');

  const demo = new ethers.Contract(d.contracts.DemoUSD.address, artifact('DemoUSD').abi, deployer);
  const cusd = new ethers.Contract(d.contracts.ConfidentialUSD.address, artifact('ConfidentialUSD').abi, deployer);
  const rail = new ethers.Contract(railAddr, artifact('PayrollRail').abi, deployer);
  const nox = new ethers.Contract(NOX_PROTOCOL, [
    'function isViewer(bytes32,address) view returns (bool)',
    'function isPubliclyDecryptable(bytes32) view returns (bool)',
  ], p);
  const railIface = rail.interface, cusdIface = cusd.interface, demoIface = demo.interface;

  const recipients = [A.dev, A.designer, A.writer, A.ops, A.advisor, A.stranger];
  console.log(`Safe ${safeAddr} | Rail ${railAddr} | cUSD ${await cusd.getAddress()}`);
  console.log(`owners: ${A.owner1.address}, ${A.owner2.address}, ${A.owner3.address} (threshold 2)`);

  const { default: Safe } = await import('@safe-global/protocol-kit');
  const safeExec = await Safe.init({ provider: RPC, signer: rawDeployerPk, safeAddress: safeAddr });
  const safeO1 = await Safe.init({ provider: RPC, signer: A.owner1.privateKey, safeAddress: safeAddr });
  const safeO2 = await Safe.init({ provider: RPC, signer: A.owner2.privateKey, safeAddress: safeAddr });

  // Execute a Safe tx: owner1 + owner2 sign off-chain, the funded deployer executes (non-owner executor OK).
  async function execSafe(label, transactions) {
    let stx = await safeExec.createTransaction({ transactions });
    stx = await safeO1.signTransaction(stx);
    stx = await safeO2.signTransaction(stx);
    const res = await safeExec.executeTransaction(stx);
    const rc = await res.transactionResponse.wait();
    console.log(`  ${label} — Safe tx ${etherscanTx(res.hash)} (gas ${rc.gasUsed})`);
    return res.hash;
  }

  const hashes = {};

  step('0', 'Fund owner1 (treasurer) a little ETH for proposeRoster');
  if ((await p.getBalance(A.owner1.address)) < ethers.parseEther('0.02')) {
    await (await deployer.sendTransaction({ to: A.owner1.address, value: ethers.parseEther('0.03') })).wait();
    console.log('  funded owner1 0.03 ETH');
  } else console.log('  owner1 already funded');

  step('1', 'Fund the Safe treasury with DemoUSD (deployer mint)');
  if ((await demo.balanceOf(safeAddr)) < usd(SEED_FLOAT)) {
    await (await demo.mint(safeAddr, usd(50000))).wait();
    console.log('  minted 50,000 dUSD to the Safe');
  } else console.log('  Safe already funded with dUSD');

  step('2', 'ONE Safe multisig batch: approve → wrap(float=cap) → setOperator(rail) → configure(treasurer,cap)');
  const quarterEnd = (await p.getBlock('latest')).timestamp + 90 * 24 * 3600;
  hashes.onboarding = await execSafe('onboarding batch', [
    { to: d.contracts.DemoUSD.address, value: '0', data: demoIface.encodeFunctionData('approve', [d.contracts.ConfidentialUSD.address, usd(SEED_FLOAT)]) },
    { to: d.contracts.ConfidentialUSD.address, value: '0', data: cusdIface.encodeFunctionData('wrap', [safeAddr, usd(SEED_FLOAT)]) },
    { to: d.contracts.ConfidentialUSD.address, value: '0', data: cusdIface.encodeFunctionData('setOperator', [railAddr, quarterEnd]) },
    { to: railAddr, value: '0', data: railIface.encodeFunctionData('configure', [A.owner1.address, usd(SEED_CAP)]) },
  ]);
  expect(await rail.isActiveOperator(), 'rail is the operator for the Safe');
  expect(await rail.configured(), 'rail configured by the Safe');
  console.log('  Safe UNWRAPPED dUSD remaining:', fmtUsd(await demo.balanceOf(safeAddr)), '(float left the Safe; rest untouched)');

  step('3', 'Treasurer (owner1) encrypts the roster (5 + 1 over-cap) and proposes it');
  const owner1HC = await handleClient(A.owner1);
  const rows = [...SEED_ROSTER, OVER_CAP_PROBE];
  const encs = await Promise.all(rows.map((r) => owner1HC.encryptInput(usd(r.amount), 'uint256', railAddr)));
  const addrs = recipients.map((w) => w.address);
  const railAsO1 = rail.connect(A.owner1);
  const id = await railAsO1.proposeRoster.staticCall(addrs, encs.map((e) => e.handle), encs.map((e) => e.handleProof));
  const propTx = await railAsO1.proposeRoster(addrs, encs.map((e) => e.handle), encs.map((e) => e.handleProof));
  const propRc = await propTx.wait();
  hashes.propose = propTx.hash;
  console.log(`  proposeRoster #${id} tx ${etherscanTx(propTx.hash)} (gas ${propRc.gasUsed})`);
  const plain4200 = usd(4200).toString(16).padStart(64, '0');
  expect(!propTx.data.includes(plain4200), 'no plaintext amount in calldata');

  step('4', 'The designer decrypts ONLY her own line (viewer-gated)');
  const designerHC = await handleClient(A.designer);
  const designerLine = await rail.lineAmountHandle(id, 1);
  const dec = await decryptWithRetry(designerHC, designerLine, { label: 'designer' });
  console.log(`  designer decrypts line 1: ${fmtUsd(dec.value)} cUSD`);
  expect(dec.value === usd(4200), `designer line must be 4,200, got ${fmtUsd(dec.value)}`);

  step('5', 'Owners approve the roster via the Safe multisig; anyone executes');
  hashes.approve = await execSafe(`approveRoster(${id})`, [
    { to: railAddr, value: '0', data: railIface.encodeFunctionData('approveRoster', [id]) },
  ]);
  const exTx = await rail.executePayroll(id);
  const exRc = await exTx.wait();
  hashes.execute = exTx.hash;
  console.log(`  executePayroll tx ${etherscanTx(exTx.hash)} (gas ${exRc.gasUsed}, ~${Number(exRc.gasUsed) / rows.length | 0}/line)`);

  step('6', 'Anyone public-decrypts the cap-compliance flags: true×5 + false×1');
  // The deepest flag (the over-cap line) depends on the full encrypted accumulator chain, so give the
  // TEE time to settle it. Read the LAST line first (longest dependency) with generous retries.
  await new Promise((r) => setTimeout(r, 12000));
  const oks = new Array(rows.length);
  for (let i = rows.length - 1; i >= 0; i--) {
    const okH = await rail.lineOkHandle(id, i);
    const { value } = await publicDecryptWithRetry(owner1HC, okH, { attempts: 15, delayMs: 4000 });
    oks[i] = value !== 0n;
  }
  console.log(`  cap checks: [${oks.join(', ')}]`);
  expect(oks.slice(0, 5).every((x) => x) && oks[5] === false, 'expected true×5 + false×1 (over-cap paid encrypted zero)');

  step('7', 'The Safe multisig grants an auditor — decrypt ALL lines; Etherscan shows nothing');
  hashes.grantAuditor = await execSafe('grantAuditor', [
    { to: railAddr, value: '0', data: railIface.encodeFunctionData('grantAuditor', [A.auditor.address]) },
  ]);
  const auditorHC = await handleClient(A.auditor);
  let total = 0n;
  for (let i = 0; i < rows.length; i++) {
    const { value } = await decryptWithRetry(auditorHC, await rail.lineAmountHandle(id, i), { label: `auditor L${i}` });
    total += value;
  }
  console.log(`  auditor sees every line; roster total ${fmtUsd(total)} cUSD (private on-chain)`);
  expect(total === usd(26000), `auditor total must be 26,000, got ${fmtUsd(total)}`);

  step('8', 'Cryptographic accounting proof: publicly decryptable "spend ≤ budget"');
  const proofH = await rail.proveSpendWithinBudget.staticCall();
  const pv = await rail.proveSpendWithinBudget();
  await pv.wait();
  hashes.proveBudget = pv.hash;
  const within = await publicDecryptWithRetry(owner1HC, proofH);
  console.log(`  spend ≤ budget? ${within.value !== 0n} (24,000 paid ≤ 25,000 cap; total never revealed)`);
  expect(within.value !== 0n, 'budget compliance must be true');

  writeFileSync(join(ROOT, 'fixtures', 'e2e-result.json'), JSON.stringify({
    network: 'sepolia', at: new Date().toISOString(), safe: safeAddr, rail: railAddr,
    designerLine: '4200', capFlags: oks, auditorTotal: '26000', txHashes: hashes,
  }, null, 2) + '\n');

  console.log(`\nALL STEPS GREEN on Sepolia via a REAL 2-of-3 Safe. Deployer ETH remaining: ${ethers.formatEther(await p.getBalance(deployer.address))}`);
  console.log('Zero mock data: every value came from the live Nox gateway + Sepolia contracts.');
}
main().catch((e) => { console.error('\nSAFE E2E FAILED:', e?.message || e); if (e?.cause) console.error('cause:', e.cause?.message || e.cause); process.exit(1); });
