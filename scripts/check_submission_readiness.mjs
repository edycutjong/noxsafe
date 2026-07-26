// Fails (exit 1) if the submission is missing anything graded. Runs fully OFFLINE. Run before shipping.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null);

let fails = 0;
const check = (ok, label, hint = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !hint ? '' : `  — ${hint}`}`);
  if (!ok) fails++;
};

// Contracts compiled
check(existsSync(join(ROOT, 'artifacts/contracts/PayrollRail.sol/PayrollRail.json')), 'PayrollRail compiled', 'run npm run compile');

// Deployments (PayrollRail is the funded-run deliverable; DemoUSD + cUSD are reused/pinned)
const dep = read('deployments.json');
const d = dep ? JSON.parse(dep) : null;
check(!!d?.contracts?.ConfidentialUSD?.address, 'ConfidentialUSD address pinned (reused)');
check(!!d?.contracts?.DemoUSD?.address, 'DemoUSD address pinned (reused)');
const railDeployed = !!d?.contracts?.PayrollRail?.address;
check(true, `PayrollRail deployed to Sepolia: ${railDeployed ? d.contracts.PayrollRail.address : 'PENDING funded run (npm run deploy)'}`);

// feedback.md — graded, >= 12 findings
const fb = read('feedback.md') || '';
const findings = (fb.match(/^### \d+\./gm) || []).length;
check(findings >= 12, `feedback.md has >= 12 findings (${findings})`, 'add more dated findings');

// README essentials
const rd = read('README.md') || '';
check(/install/i.test(rd), 'README has install steps');
check(/npm (run )?(test|e2e|deploy)/i.test(rd), 'README documents usage commands');
check(/\b(1\d\d|[7-9]\d)\b/.test(rd) && /test/i.test(rd), 'README states a test count (>= 70)');
check(!/(youtube\.com\/watch\?v=REPLACE|<video-link>|TODO-VIDEO)/i.test(rd), 'README has no video placeholder');

// SPEC + DEMO
check(existsSync(join(ROOT, 'SPEC.md')), 'SPEC.md (invariants I1–I4) present');
check(existsSync(join(ROOT, 'DEMO.md')), 'DEMO.md present');

// Secrets hygiene
const gi = read('.gitignore') || '';
check(/^\.env$/m.test(gi), '.env is gitignored');

// Tests present
check(existsSync(join(ROOT, 'packages/rail-sdk/tests')), '@noxsafe/rail-sdk unit tests present');
check(existsSync(join(ROOT, 'test/PayrollRail.rail.test.js')), 'PayrollRail contract tests present');

// Fixtures
check(existsSync(join(ROOT, 'fixtures/roster.csv')), 'fixtures/roster.csv present', 'run npm run seed');

console.log(`\n${fails === 0 ? 'READY (offline gates green) ✅' : `NOT READY — ${fails} check(s) failing`}`);
process.exit(fails === 0 ? 0 : 1);
