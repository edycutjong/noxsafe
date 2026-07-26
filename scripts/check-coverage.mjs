// Coverage gate for NoxSafe's OWN shipped contracts. Run after `hardhat coverage` (see the
// `coverage:check` npm script). Parses solidity-coverage's Istanbul report (root coverage.json) and
// EXITS NON-ZERO if any own contract is below 100% on ANY metric (statements / branches / functions /
// lines). Test scaffolding under contracts/test/ (mocks + harnesses) is intentionally excluded — it is
// never shipped. A genuine 0/0 metric counts as 100% (nothing to cover == fully covered).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COVERAGE_FILE = join(ROOT, 'coverage.json');

// The shipped contracts (basenames). Everything under contracts/test/ is scaffolding — excluded.
const OWN_CONTRACTS = ['PayrollRail.sol', 'ConfidentialUSD.sol', 'DemoUSD.sol'];

function die(msg) {
  console.error(`\n✖ coverage:check FAILED — ${msg}\n`);
  process.exit(1);
}

if (!existsSync(COVERAGE_FILE)) {
  die(`coverage report not found at ${COVERAGE_FILE}. Run \`npm run coverage\` first (coverage:check runs it for you).`);
}

let report;
try {
  report = JSON.parse(readFileSync(COVERAGE_FILE, 'utf8'));
} catch (e) {
  die(`could not parse ${COVERAGE_FILE}: ${e.message}`);
}

// pct: covered/total as a number, with 0/0 treated as 100 (nothing to cover == fully covered).
const pct = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);

/** Compute the four Istanbul metrics for one file record. */
function metricsFor(rec) {
  // statements: `s` = { id: hitCount }
  const s = Object.values(rec.s || {});
  const stmtTotal = s.length;
  const stmtCovered = s.filter((n) => n > 0).length;

  // branches: `b` = { id: [hitCount, ...] } — one entry per path
  const branchArrays = Object.values(rec.b || {});
  let brTotal = 0;
  let brCovered = 0;
  for (const paths of branchArrays) {
    for (const n of paths) {
      brTotal++;
      if (n > 0) brCovered++;
    }
  }

  // functions: `f` = { id: hitCount }
  const f = Object.values(rec.f || {});
  const fnTotal = f.length;
  const fnCovered = f.filter((n) => n > 0).length;

  // lines: `l` = { lineNo: hitCount }
  const l = Object.values(rec.l || {});
  const lineTotal = l.length;
  const lineCovered = l.filter((n) => n > 0).length;

  return {
    stmts: { covered: stmtCovered, total: stmtTotal, pct: pct(stmtCovered, stmtTotal) },
    branch: { covered: brCovered, total: brTotal, pct: pct(brCovered, brTotal) },
    funcs: { covered: fnCovered, total: fnTotal, pct: pct(fnCovered, fnTotal) },
    lines: { covered: lineCovered, total: lineTotal, pct: pct(lineCovered, lineTotal) },
  };
}

// Match every own contract to its record (path ends with the basename, NOT under contracts/test/).
const keys = Object.keys(report);
const rows = [];
const missing = [];
for (const name of OWN_CONTRACTS) {
  const key = keys.find((k) => {
    const norm = k.replace(/\\/g, '/');
    return !norm.includes('/test/') && (norm === name || norm.endsWith(`/${name}`));
  });
  if (!key) {
    missing.push(name);
    continue;
  }
  rows.push({ name, ...metricsFor(report[key]) });
}

if (missing.length) {
  die(`own contract(s) absent from the coverage report: ${missing.join(', ')}. ` +
    `Did compilation/tests skip them? Re-run \`npm run coverage\`.`);
}

// ---- Render the per-file table ----
const fmt = (m) => `${m.pct.toFixed(2).padStart(6)}% (${m.covered}/${m.total})`;
const nameW = Math.max(...rows.map((r) => r.name.length), 'Contract'.length);
const col = (s, w) => String(s).padEnd(w);
const H = (s) => col(s, 18);

console.log('\nOwn-contract coverage gate (shipped contracts must be 100% on every metric):\n');
console.log(`  ${col('Contract', nameW)}  ${H('% Stmts')}${H('% Branch')}${H('% Funcs')}${H('% Lines')}`);
console.log(`  ${'-'.repeat(nameW)}  ${'-'.repeat(18 * 4)}`);

let failed = false;
const failing = [];
for (const r of rows) {
  const cells = [r.stmts, r.branch, r.funcs, r.lines];
  const rowFail = cells.some((m) => m.pct < 100);
  if (rowFail) {
    failed = true;
    failing.push(r.name);
  }
  const mark = rowFail ? '✖' : '✓';
  console.log(
    `  ${col(r.name, nameW)}  ${H(fmt(r.stmts))}${H(fmt(r.branch))}${H(fmt(r.funcs))}${H(fmt(r.lines))} ${mark}`
  );
}

console.log('');
console.log('  Excluded (test scaffolding, not shipped): contracts/test/* — MockNoxCompute, MockERC7984, BudgetInvariantHarness.');
console.log('  Note: 0/0 metrics count as 100% (nothing to cover). No branches are excused — PayrollRail hits a true 100%.');
console.log('');

if (failed) {
  die(`below 100% on at least one metric: ${failing.join(', ')}. See the table above.`);
}

console.log('✓ coverage:check PASSED — all shipped contracts at 100% statements / branches / functions / lines.\n');
process.exit(0);
