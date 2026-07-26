// Deploy PayrollRail to the target network. On Sepolia it REUSES the already-live shared skeleton
// (DemoUSD + ConfidentialUSD wrapper) — only PayrollRail is new. On a local Hardhat node it deploys
// the full stack + installs the local Nox compute double, so the whole pipeline is runnable with ZERO gas.
import { ethers } from 'ethers';
import {
  provider, deployer, artifact, readDeployments, writeDeployments,
  etherscanAddr, IS_LOCAL, NOX_PROTOCOL, SEPOLIA_SHARED, fmtUsd,
} from './lib/nox.mjs';

async function deployOne(wallet, name, args = []) {
  const art = artifact(name);
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  const c = await factory.deploy(...args);
  const tx = c.deploymentTransaction();
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`  ${name.padEnd(16)} ${addr}  (deploy tx ${tx.hash.slice(0, 14)}...)`);
  return { address: addr, txHash: tx.hash, contract: c };
}

/** Install the local Nox compute double at the canonical local address (local-only). */
async function installMockNox(p, wallet) {
  const art = artifact('MockNoxCompute');
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  const m = await factory.deploy();
  await m.waitForDeployment();
  const code = await p.getCode(await m.getAddress());
  await p.send('hardhat_setCode', [NOX_PROTOCOL, code]);
  console.log(`  MockNoxCompute   installed at ${NOX_PROTOCOL} (local test double)`);
}

async function main() {
  const p = provider();
  const w = deployer(p);
  const safeAddr = process.env.SAFE_ADDRESS || w.address; // real 2-of-3 Safe on the funded run
  const bal0 = await p.getBalance(w.address);
  console.log(`Network  : ${IS_LOCAL ? 'localhost (31337)' : 'sepolia (11155111)'}`);
  console.log('Deployer :', w.address);
  console.log('Safe     :', safeAddr, safeAddr === w.address ? '(EOA acting as Safe — set SAFE_ADDRESS for the real multisig)' : '');
  console.log('Balance  :', ethers.formatEther(bal0), 'ETH\n');

  const d = readDeployments();
  d.deployer = w.address;
  d.safe = safeAddr;
  d.contracts = d.contracts || {};

  let demoAddr, cusdAddr;
  console.log('Deploying...');
  if (IS_LOCAL) {
    await installMockNox(p, w);
    const demo = await deployOne(w, 'DemoUSD');
    const cusd = await deployOne(w, 'ConfidentialUSD', [demo.address]);
    demoAddr = demo.address; cusdAddr = cusd.address;
    d.contracts.DemoUSD = { address: demo.address, deployTx: demo.txHash, underlyingDecimals: 6 };
    d.contracts.ConfidentialUSD = { address: cusd.address, deployTx: cusd.txHash, underlying: demo.address, symbol: 'cUSD' };
  } else {
    // REUSE the already-live shared skeleton — do NOT redeploy DemoUSD / ConfidentialUSD.
    demoAddr = SEPOLIA_SHARED.DemoUSD; cusdAddr = SEPOLIA_SHARED.ConfidentialUSD;
    console.log(`  DemoUSD          ${demoAddr}  (REUSED — already live)`);
    console.log(`  ConfidentialUSD  ${cusdAddr}  (REUSED — already live)`);
    d.contracts.DemoUSD = { address: demoAddr, reused: true, underlyingDecimals: 6 };
    d.contracts.ConfidentialUSD = { address: cusdAddr, reused: true, underlying: demoAddr, symbol: 'cUSD' };
  }

  const rail = await deployOne(w, 'PayrollRail', [cusdAddr, safeAddr]);
  d.contracts.PayrollRail = { address: rail.address, deployTx: rail.txHash, cUSD: cusdAddr, safe: safeAddr };
  d.noxProtocol = NOX_PROTOCOL;
  d.deployedAt = new Date().toISOString();
  d.gatewaySelfServe = true;
  writeDeployments(d);

  // Sanity read-back.
  const railR = new ethers.Contract(rail.address, artifact('PayrollRail').abi, p);
  console.log('\nRead-back:');
  console.log('  PayrollRail.safe  :', await railR.safe());
  console.log('  PayrollRail.cUSD  :', await railR.cUSD());
  console.log('  configured?       :', await railR.configured());

  const bal1 = await p.getBalance(w.address);
  console.log('\nGas spent:', ethers.formatEther(bal0 - bal1), 'ETH  |  remaining:', ethers.formatEther(bal1), 'ETH');
  if (!IS_LOCAL) {
    console.log('\nExplorer:');
    console.log('  PayrollRail    ', etherscanAddr(rail.address));
  }
  console.log('\n' + (IS_LOCAL ? 'deployments.local.json' : 'deployments.json') + ' written.');
}

main().catch((e) => { console.error('DEPLOY FAILED:', e?.message || e); process.exit(1); });
