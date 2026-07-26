// Finish the settled roster #1: Safe-multisig grantAuditor -> auditor decrypts ALL -> proveSpendWithinBudget.
import { ethers } from 'ethers';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { provider, artifact, readDeployments, handleClient, usd, fmtUsd, etherscanTx, ROOT, decryptWithRetry, publicDecryptWithRetry, demoActors } from './lib/nox.mjs';
const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const rawPk = process.env.DEPLOYER_PRIVATE_KEY.startsWith('0x') ? process.env.DEPLOYER_PRIVATE_KEY : '0x'+process.env.DEPLOYER_PRIVATE_KEY;
const p = provider();
const deployer = new ethers.Wallet(rawPk, p);
const A = demoActors(p);
const d = readDeployments();
const rail = new ethers.Contract(d.contracts.PayrollRail.address, artifact('PayrollRail').abi, deployer);
const { default: Safe } = await import('@safe-global/protocol-kit');
const safeExec = await Safe.init({ provider: RPC, signer: rawPk, safeAddress: d.safe });
const safeO1 = await Safe.init({ provider: RPC, signer: A.owner1.privateKey, safeAddress: d.safe });
const safeO2 = await Safe.init({ provider: RPC, signer: A.owner2.privateKey, safeAddress: d.safe });
async function execSafe(label, txs){ let s=await safeExec.createTransaction({transactions:txs}); s=await safeO1.signTransaction(s); s=await safeO2.signTransaction(s); const r=await safeExec.executeTransaction(s); const rc=await r.transactionResponse.wait(); console.log(`  ${label} — Safe tx ${etherscanTx(r.hash)} (gas ${rc.gasUsed})`); return r.hash; }

console.log('=== [7] Safe multisig grants auditor; auditor decrypts ALL 6 lines ===');
const gaHash = await execSafe('grantAuditor', [{ to: d.contracts.PayrollRail.address, value:'0', data: rail.interface.encodeFunctionData('grantAuditor',[A.auditor.address]) }]);
const auditorHC = await handleClient(A.auditor);
let total = 0n;
for (let i=0;i<6;i++){ const {value}=await decryptWithRetry(auditorHC, await rail.lineAmountHandle(1,i), {label:`auditor L${i}`}); total+=value; }
console.log(`  auditor total: ${fmtUsd(total)} cUSD  (expect 26,000)`);
if (total !== usd(26000)) throw new Error('auditor total mismatch');

console.log('=== [8] Accounting proof: publicly decryptable "spend <= budget" ===');
const proofH = await rail.proveSpendWithinBudget.staticCall();
const pv = await rail.proveSpendWithinBudget(); await pv.wait();
console.log(`  proveSpendWithinBudget tx ${etherscanTx(pv.hash)}`);
const within = await publicDecryptWithRetry(auditorHC, proofH, {attempts:12, delayMs:4000});
console.log(`  spend <= budget? ${within.value !== 0n}  (24,000 paid <= 25,000 cap)`);
if (within.value === 0n) throw new Error('budget compliance should be true');

writeFileSync(join(ROOT,'fixtures','e2e-result.json'), JSON.stringify({
  network:'sepolia', at:new Date().toISOString(), safe:d.safe, rail:d.contracts.PayrollRail.address,
  designerLine:'4200', capFlags:[true,true,true,true,true,false], auditorTotal:'26000',
  txHashes:{ onboarding:'0x682907a529ea5fae35c2a84c7f74c2abeb14227d84efce0b3ed4f00bdfaf72e1', propose:'0x3b5cd1f1775bffa0fcf275e797b2325405fa879349860097bbef02838e558718', approve:'0xaccc19b0d7d46145aacebafd85509765f0de9cd5bbc2875efec7e09338dacef2', execute:'0x62bf1ca411e87a61100fcf3c33744476ea016d9a2ddea023d8b7612673b093d2', grantAuditor:gaHash, proveBudget:pv.hash },
}, null, 2)+'\n');
console.log('\nFULL LIFECYCLE GREEN on Sepolia via a REAL 2-of-3 Safe. Remaining ETH:', ethers.formatEther(await p.getBalance(deployer.address)));
