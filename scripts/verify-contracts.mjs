// Etherscan source verification for PayrollRail (the only NEW contract; DemoUSD + cUSD are reused and
// already verified). Runs `hardhat verify` when ETHERSCAN_API_KEY is set; otherwise prints the commands.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const d = JSON.parse(readFileSync(join(ROOT, 'deployments.json'), 'utf8'));
const key = process.env.ETHERSCAN_API_KEY;

const rail = d.contracts?.PayrollRail;
if (!rail?.address) {
  console.error('No PayrollRail in deployments.json — run `npm run deploy` first.');
  process.exit(1);
}
const targets = [
  { name: 'PayrollRail', address: rail.address, args: [rail.cUSD, rail.safe] },
];

if (!key) {
  console.log('No ETHERSCAN_API_KEY in .env — skipping automated verification.');
  console.log('DemoUSD + ConfidentialUSD are REUSED (already verified). Command that will run for the rail:');
  for (const t of targets) console.log(`  npx hardhat verify --network sepolia ${t.address} ${t.args.join(' ')}`.trim());
  process.exit(0);
}

for (const t of targets) {
  console.log(`\nVerifying ${t.name} @ ${t.address} ...`);
  try {
    execSync(`npx hardhat verify --network sepolia ${t.address} ${t.args.join(' ')}`.trim(), { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.log(`  (${t.name} verify failed or already verified — continuing)`);
  }
}
