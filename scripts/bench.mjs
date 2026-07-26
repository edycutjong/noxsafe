// Benchmark the NoxSafe roster flow on live Sepolia: concurrent-encrypt wall time for an N-line roster
// (the treasurer's "encrypt & propose"), decrypt p50/p95 (gateway), and per-payout gas read from the
// real settled roster's executePayroll receipt. Writes fixtures/bench.json for the README.
import { ethers } from 'ethers';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  provider, deployer, artifact, readDeployments, handleClient, usd, ROOT, decryptWithRetry, demoActors,
} from './lib/nox.mjs';

const N = Number(process.env.BENCH_N || 10);
const N_DECRYPT = Number(process.env.BENCH_DECRYPT_N || 20);

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (pp) => s[Math.min(s.length - 1, Math.floor((pp / 100) * s.length))];
  const sum = s.reduce((a, b) => a + b, 0);
  return { n: s.length, min: s[0], p50: q(50), p95: q(95), max: s[s.length - 1], mean: Math.round(sum / s.length) };
}
const row = (label, st) => `${label.padEnd(30)} n=${String(st.n).padEnd(3)} min=${st.min} p50=${st.p50} p95=${st.p95} max=${st.max} (ms)`;

async function main() {
  const p = provider();
  const alice = deployer(p);
  const A = demoActors(p);
  const d = readDeployments();
  const cusd = new ethers.Contract(d.contracts.ConfidentialUSD.address, artifact('ConfidentialUSD').abi, p);
  const rail = new ethers.Contract(d.contracts.PayrollRail.address, artifact('PayrollRail').abi, p);
  const railAddr = await rail.getAddress();
  const hc = await handleClient(alice);
  console.log(`Benchmark on Sepolia — encrypt N=${N}, decrypt N=${N_DECRYPT}\n`);

  // Stage 1: concurrent encryptInput wall-time for an N-line roster (bound to the rail; no tx, no gas).
  const t0 = Date.now();
  await Promise.all(Array.from({ length: N }, (_, i) => hc.encryptInput(usd(1000 + i), 'uint256', railAddr)));
  const concurrentEncryptMs = Date.now() - t0;
  console.log(`concurrent encryptInput x${N}          ${concurrentEncryptMs} ms  (${Math.round(concurrentEncryptMs / N)} ms/line amortized)`);

  // Stage 2: decrypt latency (gateway round-trip). The designer decrypts her own settled line repeatedly.
  const designerHC = await handleClient(A.designer);
  const lineH = await rail.lineAmountHandle(1, 1);
  const dec = [];
  for (let i = 0; i < N_DECRYPT; i++) {
    const t = Date.now();
    await decryptWithRetry(designerHC, lineH, { attempts: 6, delayMs: 2000 });
    dec.push(Date.now() - t);
    process.stdout.write(`  decrypt ${i + 1}/${N_DECRYPT}\r`);
  }
  const decStats = stats(dec);
  console.log(' '.repeat(30) + '\r' + row('decrypt (gateway)', decStats));

  // Stage 3: per-payout gas from the REAL settled roster #1 (avoids re-spending gas on a fresh roster).
  const res = existsSync(join(ROOT, 'fixtures', 'e2e-result.json'))
    ? JSON.parse(readFileSync(join(ROOT, 'fixtures', 'e2e-result.json'), 'utf8')) : null;
  let proposeGas = null, executeGas = null, perPayoutGas = null, lines = null;
  if (res?.txHashes?.execute) {
    lines = Number(await rail.lineCount(1));
    const exRc = await p.getTransactionReceipt(res.txHashes.execute);
    const propRc = res.txHashes.propose ? await p.getTransactionReceipt(res.txHashes.propose) : null;
    executeGas = Number(exRc.gasUsed);
    proposeGas = propRc ? Number(propRc.gasUsed) : null;
    perPayoutGas = Math.round(executeGas / lines);
    console.log(`proposeRoster gas (${lines} lines)     ${proposeGas}`);
    console.log(`executePayroll gas (${lines} lines)    ${executeGas}`);
    console.log(`per-payout gas                        ${perPayoutGas}`);
  }

  mkdirSync(join(ROOT, 'fixtures'), { recursive: true });
  writeFileSync(join(ROOT, 'fixtures', 'bench.json'), JSON.stringify({
    network: 'sepolia', at: new Date().toISOString(), encryptN: N,
    concurrentEncryptMs, encryptPerLineMs: Math.round(concurrentEncryptMs / N),
    settledRosterLines: lines, proposeGas, executeGas, perPayoutGas, decrypt: decStats,
  }, null, 2) + '\n');
  console.log('\nWrote fixtures/bench.json');
}
main().catch((e) => { console.error('BENCH FAILED:', e?.message || e); process.exit(1); });
