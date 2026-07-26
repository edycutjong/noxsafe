// NoxSafe end-to-end proof on LIVE Ethereum Sepolia. Zero mock data — every value comes from the real
// Nox gateway + Sepolia contracts. Reuses the already-live DemoUSD + cUSD; the rail is deployed by
// scripts/deploy.mjs with safe == deployer (EOA-as-Safe) so this script can drive the full lifecycle.
// The SUBMISSION demo runs the SAME batch inside app.safe.global against a real 2-of-3 Safe (see DEMO.md).
//
// Flow: onboard (approve->wrap->setOperator->configure) -> propose encrypted roster (5 + 1 over-cap)
//       -> recipient decrypts own line -> approve -> execute -> publicDecrypt cap flags (true x5,false x1)
//       -> grantAuditor (decrypt all) -> grantOfficer (admin) -> proveSpendWithinBudget.
import { ethers } from 'ethers';
import {
  provider, deployer, artifact, readDeployments, handleClient, usd, fmtUsd, etherscanTx,
  decryptWithRetry, publicDecryptWithRetry, demoActors, SEED_ROSTER, SEED_CAP, SEED_FLOAT, OVER_CAP_PROBE, NOX_PROTOCOL,
} from './lib/nox.mjs';

const line = (s = '') => console.log(s);
const step = (n, s) => console.log(`\n=== [${n}] ${s} ===`);
const expect = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg); };

async function main() {
  const p = provider();
  const alice = deployer(p); // acts as Safe + treasurer in EOA mode
  const A = demoActors(p);
  const recipients = [A.dev, A.designer, A.writer, A.ops, A.advisor, A.stranger]; // 6th = over-cap probe
  const d = readDeployments();
  if (!d.contracts?.PayrollRail?.address) throw new Error('Deploy first: npm run deploy');

  const demo = new ethers.Contract(d.contracts.DemoUSD.address, artifact('DemoUSD').abi, alice);
  const cusd = new ethers.Contract(d.contracts.ConfidentialUSD.address, artifact('ConfidentialUSD').abi, alice);
  const rail = new ethers.Contract(d.contracts.PayrollRail.address, artifact('PayrollRail').abi, alice);
  const nox = new ethers.Contract(NOX_PROTOCOL, [
    'function isViewer(bytes32,address) view returns (bool)',
    'function isAllowed(bytes32,address) view returns (bool)',
    'function isPubliclyDecryptable(bytes32) view returns (bool)',
  ], p);
  const railAddr = await rail.getAddress();
  const cusdAddr = await cusd.getAddress();
  const aliceHC = await handleClient(alice);
  const designerHC = await handleClient(A.designer);
  const auditorHC = await handleClient(A.auditor);

  line(`Rail ${railAddr} | cUSD ${cusdAddr} | Safe/Treasurer ${alice.address}`);

  step('0', 'Fund recipients a little Sepolia ETH (only if low)');
  for (const w of [A.designer, A.auditor]) {
    if ((await p.getBalance(w.address)) < ethers.parseEther('0.0008')) {
      await (await alice.sendTransaction({ to: w.address, value: ethers.parseEther('0.0015') })).wait();
    }
  }

  step('1', 'Onboarding batch: mint/approve/wrap(float=cap) -> setOperator(rail) -> configure');
  if ((await demo.balanceOf(alice.address)) < usd(SEED_FLOAT)) {
    await (await demo.mint(alice.address, usd(SEED_FLOAT))).wait();
  }
  await (await demo.approve(cusdAddr, usd(SEED_FLOAT))).wait();
  await (await cusd.wrap(alice.address, usd(SEED_FLOAT))).wait();
  const quarterEnd = (await p.getBlock('latest')).timestamp + 90 * 24 * 3600;
  await (await cusd.setOperator(railAddr, quarterEnd)).wait();
  await (await rail.configure(alice.address, usd(SEED_CAP))).wait();
  expect(await rail.isActiveOperator(), 'rail is operator');
  line(`  configured: cap ${SEED_CAP}, float ${SEED_FLOAT} (float == cap)`);

  step('2', 'Treasurer encrypts the roster (concurrent) and proposes it');
  const rows = [...SEED_ROSTER, OVER_CAP_PROBE];
  const encs = await Promise.all(rows.map((r) => aliceHC.encryptInput(usd(r.amount), 'uint256', railAddr)));
  const addrs = recipients.map((w) => w.address);
  const tx = await rail.proposeRoster(addrs, encs.map((e) => e.handle), encs.map((e) => e.handleProof));
  const rc = await tx.wait();
  line(`  proposeRoster tx ${etherscanTx(tx.hash)} (gas ${rc.gasUsed})`);
  const plain4200 = usd(4200).toString(16).padStart(64, '0');
  expect(!tx.data.includes(plain4200), 'no plaintext amount in calldata');
  line(`  calldata leaks "4200e6"? ${tx.data.includes(plain4200)} (must be false)`);

  step('3', 'The designer decrypts ONLY her own line (viewer-gated)');
  const designerLine = await rail.lineAmountHandle(1, 1); // index 1 = Designer
  const dec = await decryptWithRetry(designerHC, designerLine, { label: 'designer' });
  line(`  designer decrypts line 1: ${fmtUsd(dec.value)} cUSD`);
  expect(dec.value === usd(4200), `designer line must be 4,200, got ${fmtUsd(dec.value)}`);

  step('4', 'Owners approve + anyone executes (operator-pull, per-line encrypted cap check)');
  await (await rail.approveRoster(1)).wait();
  const exTx = await rail.executePayroll(1);
  const exRc = await exTx.wait();
  line(`  executePayroll tx ${etherscanTx(exTx.hash)} (gas ${exRc.gasUsed}, ${Number(exRc.gasUsed) / rows.length | 0}/line)`);

  step('5', 'Anyone public-decrypts the cap-compliance flags: true x5 + false x1');
  const oks = [];
  for (let i = 0; i < rows.length; i++) {
    const okH = await rail.lineOkHandle(1, i);
    const { value } = await publicDecryptWithRetry(aliceHC, okH);
    oks.push(value !== 0n);
  }
  line(`  cap checks: [${oks.join(', ')}]`);
  expect(oks.slice(0, 5).every((x) => x) && oks[5] === false, 'expected true x5 + false x1 (over-cap paid encrypted zero)');

  step('6', 'Multisig grants an auditor — decrypt ALL lines; Etherscan still shows nothing');
  await (await rail.grantAuditor(A.auditor.address)).wait();
  let total = 0n;
  for (let i = 0; i < rows.length; i++) {
    const h = await rail.lineAmountHandle(1, i);
    const { value } = await decryptWithRetry(auditorHC, h, { label: `auditor L${i}` });
    total += value;
  }
  line(`  auditor sees every line; roster total ${fmtUsd(total)} cUSD (private on-chain)`);
  expect(total === usd(26000), `auditor total must be 26,000, got ${fmtUsd(total)}`);

  step('7', 'Cryptographic accounting proof: publicly decryptable "spend <= budget"');
  const proof = await rail.proveSpendWithinBudget.staticCall();
  await (await rail.proveSpendWithinBudget()).wait();
  const within = await publicDecryptWithRetry(aliceHC, proof);
  line(`  spend <= budget? ${within.value !== 0n} (24,000 paid <= 25,000 cap; total/lines never revealed)`);
  expect(within.value !== 0n, 'budget compliance must be true');

  line(`\nALL STEPS GREEN on Sepolia. Deployer ETH remaining: ${ethers.formatEther(await p.getBalance(alice.address))}`);
  line('Zero mock data: every number came from the live Nox gateway + Sepolia contracts.');
}
main().catch((e) => { console.error('\nE2E FAILED:', e?.message || e); if (e?.cause) console.error('cause:', e.cause?.message || e.cause); process.exit(1); });
