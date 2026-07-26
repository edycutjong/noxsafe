// Roster domain logic for NoxSafe: CSV parsing, the encrypted budget-cap accumulator (mirrored in
// plaintext for the treasurer-side preview + the /verify exhibit), and the on-chain roster hash.
// All pure + deterministic — the single source of truth shared by the CLI, scripts, UI, and tests.
import { keccak256, AbiCoder, getAddress, isAddress } from 'ethers';
import { toBaseUnits, fromBaseUnits, formatDisplay } from './amounts.js';

export interface RosterLine {
  /** Optional human label (contributor name/role) — used in the UI, never on-chain. */
  name?: string;
  /** Recipient address (checksummed). Public on-chain — only the amount is sealed. */
  recipient: string;
  /** Amount in base units (6 decimals). Sealed on-chain. */
  amount: bigint;
}

const COMMENT = /^\s*#/;
const HEADER = /^\s*(name|label)?\s*,?\s*(address|recipient|to)\b/i;

/**
 * Parse a roster CSV. Accepted row shapes (header optional, `#` comments + blank lines skipped):
 *   name,address,amount     e.g.  Designer,0xabc...,4200
 *   address,amount          e.g.  0xabc...,4200
 * Amounts accept thousands separators ("4,200" must be quoted or use "4200"/"4200.50").
 */
export function parseRosterCsv(csv: string): RosterLine[] {
  const out: RosterLine[] = [];
  const rows = csv.split(/\r?\n/);
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw || !raw.trim() || COMMENT.test(raw)) continue;
    if (HEADER.test(raw)) continue;
    const cells = splitCsvRow(raw);
    let name: string | undefined;
    let addr: string;
    let amt: string;
    if (cells.length >= 3) {
      [name, addr, amt] = [cells[0], cells[1], cells[2]];
    } else if (cells.length === 2) {
      [addr, amt] = [cells[0], cells[1]];
    } else {
      throw new Error(`Roster CSV row ${i + 1}: expected 2 or 3 columns, got ${cells.length}`);
    }
    if (!isAddress(addr.trim())) {
      throw new Error(`Roster CSV row ${i + 1}: invalid address "${addr}"`);
    }
    out.push({
      name: name?.trim() || undefined,
      recipient: getAddress(addr.trim()),
      amount: toBaseUnits(amt),
    });
  }
  if (out.length === 0) throw new Error('Roster CSV contained no data rows');
  return out;
}

/** Split a CSV row honoring simple double-quoted cells (so "4,200" stays one cell). */
export function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/** Sum of all line amounts (base units). */
export function rosterTotal(lines: RosterLine[]): bigint {
  return lines.reduce((a, l) => a + l.amount, 0n);
}

export interface CapStatus {
  total: bigint;
  cap: bigint;
  /** Sum of amounts that actually pay under the running-accumulator rule. */
  paid: bigint;
  withinCap: boolean;
  /** total - cap, clamped at 0. */
  overBy: bigint;
  /** cap - paid (remaining budget after the roster). */
  remaining: bigint;
  /** Per-line pass/fail under the on-chain accumulator: ok_i = (spent + amt_i) <= cap. */
  perLineOk: boolean[];
}

/**
 * Mirror the on-chain encrypted budget invariant in plaintext for the treasurer preview + /verify.
 * On-chain: ok_i = le(add(spent, amt_i), cap); pay_i = select(ok_i, amt_i, 0); spent += pay_i.
 * So the accumulator only advances by lines that actually pay — a later, smaller line can still fit
 * even after an earlier line was rejected. This function reproduces that exactly.
 */
export function capStatus(lines: RosterLine[], cap: bigint): CapStatus {
  let spent = 0n;
  const perLineOk: boolean[] = [];
  for (const l of lines) {
    const ok = spent + l.amount <= cap;
    perLineOk.push(ok);
    if (ok) spent += l.amount;
  }
  const total = rosterTotal(lines);
  return {
    total,
    cap,
    paid: spent,
    withinCap: total <= cap,
    overBy: total > cap ? total - cap : 0n,
    remaining: cap > spent ? cap - spent : 0n,
    perLineOk,
  };
}

/**
 * The roster hash the PayrollRail commits at propose-time and owners approve:
 *   keccak256(abi.encode(address[] recipients, bytes32[] handleIds)).
 * Matches PayrollRail.proposeRoster exactly — approve/execute integrity (invariant I3).
 */
export function computeRosterHash(recipients: string[], handleIds: string[]): string {
  if (recipients.length !== handleIds.length) {
    throw new Error('recipients and handleIds length mismatch');
  }
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ['address[]', 'bytes32[]'],
    [recipients.map((r) => getAddress(r)), handleIds]
  );
  return keccak256(encoded);
}

/** Human summary of a cap status for CLI/UI/README (numbers never drift from the fixture). */
export function formatCapStatus(s: CapStatus, symbol = 'cUSD'): string {
  const flags = s.perLineOk.map((ok) => (ok ? 'ok' : 'OVER')).join(', ');
  return [
    `total   ${formatDisplay(s.total, symbol)}`,
    `cap     ${formatDisplay(s.cap, symbol)}`,
    `paid    ${formatDisplay(s.paid, symbol)}`,
    `within  ${s.withinCap ? 'yes' : `no (over by ${fromBaseUnits(s.overBy)})`}`,
    `lines   [${flags}]`,
  ].join('  |  ');
}
