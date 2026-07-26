#!/usr/bin/env -S npx tsx
// noxsafe — drive the whole NoxSafe payroll flow headless, over @noxsafe/rail-sdk.
// Usage: npx tsx packages/cli/src/index.ts <command> [args]   (or: npm run cli -- <command>)
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JsonRpcProvider, Wallet } from 'ethers';
import { createEthersHandleClient } from '@iexec-nox/handle';
import {
  NoxSafeClient, SEPOLIA, formatDisplay, parseRosterCsv, capStatus, formatCapStatus, toBaseUnits,
  type NoxSafeConfig, type HandleClientLike,
} from '@noxsafe/rail-sdk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RPC = process.env.SEPOLIA_RPC_URL || SEPOLIA.rpcUrl;
const rawPk = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || '';
const PK = rawPk.startsWith('0x') ? rawPk : rawPk ? '0x' + rawPk : '';
const fmt = (v: bigint) => formatDisplay(v, 'cUSD');

function flag(args: string[], name: string, dflt?: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}

function loadConfig(): NoxSafeConfig {
  const d = JSON.parse(readFileSync(join(ROOT, 'deployments.json'), 'utf8'));
  return {
    network: SEPOLIA,
    contracts: {
      payrollRail: d.contracts.PayrollRail.address,
      confidentialUSD: d.contracts.ConfidentialUSD.address,
      underlying: d.contracts.DemoUSD.address,
      safe: d.safe,
    },
  };
}

async function makeClient(): Promise<NoxSafeClient> {
  if (!PK) throw new Error('Set DEPLOYER_PRIVATE_KEY (or PRIVATE_KEY) in .env');
  const provider = new JsonRpcProvider(RPC, 11155111, { staticNetwork: true });
  const wallet = new Wallet(PK, provider);
  const handle = (await createEthersHandleClient(wallet)) as unknown as HandleClientLike;
  return new NoxSafeClient(wallet, handle, loadConfig());
}

const HELP = `noxsafe — confidential payroll rails for Safe multisigs (iExec Nox, Sepolia)

  OFFLINE (no chain):
    roster preview --csv <file> [--cap 25000]   parse a roster CSV + show the encrypted cap check

  ON-CHAIN (needs .env key + deployments.json):
    roster propose --csv <file>                 encrypt (concurrent) + propose a roster -> rosterId
    roster approve <id>                         owners approve (multisig / onlySafe)
    roster execute <id>                         execute an approved roster (operator-pull payouts)
    roster status <id>                          DRAFT/PROPOSED/APPROVED/SETTLED
    payslip <id> <index>                        decrypt one line as the recipient (viewer-gated)
    audit <id>                                  decrypt EVERY line (as a granted auditor)
    verify <id>                                 public-decrypt the per-line cap-compliance flags
    grant-auditor <address>                     multisig grants read-all viewer access
    grant-officer <address>                     multisig grants ADMIN (irrevocable) access
    prove-budget                                publish the public "spend <= budget" ebool
`;

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  const args = [sub, ...rest].filter((x) => x !== undefined) as string[];

  if (!cmd || cmd === 'help' || cmd === '--help') return console.log(HELP);

  // ---- OFFLINE command ----
  if (cmd === 'roster' && sub === 'preview') {
    const csvPath = flag(rest, '--csv');
    if (!csvPath || !existsSync(csvPath)) throw new Error('Pass --csv <file> (existing roster CSV)');
    const cap = toBaseUnits(flag(rest, '--cap', '25000')!);
    const lines = parseRosterCsv(readFileSync(csvPath, 'utf8'));
    console.log(`Roster (${lines.length} lines):`);
    for (const l of lines) console.log(`  ${(l.name ?? '').padEnd(10)} ${l.recipient}  🔒 ${fmt(l.amount)}`);
    console.log('\nEncrypted budget check (mirrors on-chain le+select):');
    console.log('  ' + formatCapStatus(capStatus(lines, cap)));
    return;
  }

  // ---- ON-CHAIN commands ----
  const nox = await makeClient();
  switch (`${cmd} ${sub ?? ''}`.trim()) {
    case 'roster propose': {
      const csvPath = flag(rest, '--csv');
      if (!csvPath) throw new Error('Pass --csv <file>');
      const lines = parseRosterCsv(readFileSync(csvPath!, 'utf8'));
      const r = await nox.proposeRoster(lines);
      console.log(`proposed roster #${r.id}  hash ${r.rosterHash}  tx ${r.txHash}`);
      break;
    }
    case 'roster approve':
      console.log('approved:', await nox.approveRoster(BigInt(args[0]))); break;
    case 'roster execute':
      console.log('executed:', await nox.executePayroll(BigInt(args[0]))); break;
    case 'roster status':
      console.log(await nox.rosterStatus(BigInt(args[0]))); break;
    case 'payslip': {
      const v = await nox.decryptLine(BigInt(args[0]), Number(args[1]));
      console.log(`line ${args[1]} of roster ${args[0]}: ${fmt(v)}`);
      break;
    }
    case 'grant-auditor':
      console.log('granted auditor:', await nox.grantAuditor(args[0])); break;
    case 'grant-officer':
      console.log('granted officer:', await nox.grantOfficer(args[0])); break;
    case 'prove-budget': {
      const { okHandle, txHash } = await nox.proveSpendWithinBudget();
      console.log(`budget-compliance handle ${okHandle}  tx ${txHash}`);
      break;
    }
    case 'audit': {
      const id = BigInt(args[0]);
      const count = Number(await nox.rail.lineCount(id));
      for (let i = 0; i < count; i++) {
        console.log(`  line ${i}: ${fmt(await nox.decryptLine(id, i))}`);
      }
      break;
    }
    case 'verify': {
      const id = BigInt(args[0]);
      const count = Number(await nox.rail.lineCount(id));
      const oks: boolean[] = [];
      for (let i = 0; i < count; i++) oks.push(await nox.publicDecryptOk(id, i));
      console.log(`cap-compliance flags: [${oks.join(', ')}]`);
      break;
    }
    default:
      console.log(HELP);
  }
}

main().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); });
