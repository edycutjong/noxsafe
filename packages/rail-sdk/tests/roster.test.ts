import { describe, it, expect } from 'vitest';
import {
  parseRosterCsv, splitCsvRow, rosterTotal, capStatus, computeRosterHash, formatCapStatus,
  type RosterLine,
} from '../src/roster.js';
import { toBaseUnits } from '../src/amounts.js';
import { getAddress } from 'ethers';

const U = (n: number | string) => toBaseUnits(n);

// The deterministic seed cast (SEED_DATA.md) — numbers never drift from the fixture.
const A = {
  dev: '0x1111111111111111111111111111111111111111',
  designer: '0x2222222222222222222222222222222222222222',
  writer: '0x3333333333333333333333333333333333333333',
  ops: '0x4444444444444444444444444444444444444444',
  advisor: '0x5555555555555555555555555555555555555555',
  probe: '0x6666666666666666666666666666666666666666',
};
const SEED_CSV = `# Meridian Collective — Q3 roster
name,address,amount
Dev,${A.dev},12000
Designer,${A.designer},4200
Writer,${A.writer},1800
Ops,${A.ops},3500
Advisor,${A.advisor},2500`;

describe('splitCsvRow', () => {
  it('splits plain rows', () => expect(splitCsvRow('a,b,c')).toEqual(['a', 'b', 'c']));
  it('keeps quoted commas together', () =>
    expect(splitCsvRow('Designer,"0xabc","4,200"')).toEqual(['Designer', '0xabc', '4,200']));
  it('trims whitespace', () => expect(splitCsvRow(' a , b ')).toEqual(['a', 'b']));
});

describe('parseRosterCsv', () => {
  it('parses the 5-line seed roster (name,address,amount)', () => {
    const lines = parseRosterCsv(SEED_CSV);
    expect(lines).toHaveLength(5);
    expect(lines[1].name).toBe('Designer');
    expect(lines[1].amount).toBe(U(4200));
  });
  it('checksums recipient addresses (EIP-55)', () => {
    const lower = '0xffff111111111111111111111111111111111111';
    const lines = parseRosterCsv(`${lower},100`);
    expect(lines[0].recipient).toBe(getAddress(lower)); // stored checksummed, not lowercase
    expect(lines[0].recipient).not.toBe(lower);
  });
  it('supports the 2-column (address,amount) shape', () => {
    const lines = parseRosterCsv(`${A.dev},1800`);
    expect(lines[0].recipient.toLowerCase()).toBe(A.dev);
    expect(lines[0].amount).toBe(U(1800));
    expect(lines[0].name).toBeUndefined();
  });
  it('skips comments, blanks, and the header row', () => {
    const lines = parseRosterCsv(`# comment\n\nname,address,amount\n${A.dev},1000\n`);
    expect(lines).toHaveLength(1);
  });
  it('parses quoted thousands separators', () => {
    const lines = parseRosterCsv(`Designer,${A.designer},"4,200"`);
    expect(lines[0].amount).toBe(U(4200));
  });
  it('parses fractional amounts to 6 decimals', () => {
    const lines = parseRosterCsv(`${A.dev},1800.50`);
    expect(lines[0].amount).toBe(1800_500000n);
  });
  it('throws on an invalid address', () => {
    expect(() => parseRosterCsv(`notanaddress,100`)).toThrow(/invalid address/i);
  });
  it('throws on a single-column row', () => {
    expect(() => parseRosterCsv(`${A.dev}`)).toThrow(/2 or 3 columns/);
  });
  it('throws on an all-empty CSV', () => {
    expect(() => parseRosterCsv(`# just a comment\n\n`)).toThrow(/no data rows/i);
  });
});

describe('rosterTotal', () => {
  it('sums the seed roster to 24,000', () => {
    expect(rosterTotal(parseRosterCsv(SEED_CSV))).toBe(U(24000));
  });
  it('is 0 for an empty list', () => expect(rosterTotal([])).toBe(0n));
});

describe('capStatus (mirrors the on-chain le+select accumulator)', () => {
  const seed = () => parseRosterCsv(SEED_CSV);

  it('the 24,000 seed roster is within the 25,000 cap; all 5 lines pay', () => {
    const s = capStatus(seed(), U(25000));
    expect(s.withinCap).toBe(true);
    expect(s.perLineOk).toEqual([true, true, true, true, true]);
    expect(s.paid).toBe(U(24000));
    expect(s.overBy).toBe(0n);
    expect(s.remaining).toBe(U(1000));
  });

  it('adding an over-cap 6th line (2,000) flags exactly that line false; others still pay', () => {
    const lines: RosterLine[] = [...seed(), { name: 'Probe', recipient: A.probe, amount: U(2000) }];
    const s = capStatus(lines, U(25000));
    expect(s.perLineOk).toEqual([true, true, true, true, true, false]);
    expect(s.paid).toBe(U(24000)); // the over-cap line pays encrypted zero
    expect(s.total).toBe(U(26000));
    expect(s.overBy).toBe(U(1000)); // total 26,000 - cap 25,000
    expect(s.withinCap).toBe(false);
  });

  it('a line exactly hitting the cap passes (le, not lt)', () => {
    const lines: RosterLine[] = [
      { recipient: A.dev, amount: U(23000) },
      { recipient: A.designer, amount: U(2000) },
    ];
    expect(capStatus(lines, U(25000)).perLineOk).toEqual([true, true]);
  });

  it('a later smaller line still fits after an earlier line is rejected (accumulator semantics)', () => {
    const lines: RosterLine[] = [
      { recipient: A.dev, amount: U(24000) }, // ok -> spent 24000
      { recipient: A.designer, amount: U(2000) }, // 26000 > 25000 -> rejected, spent stays 24000
      { recipient: A.writer, amount: U(500) }, // 24500 <= 25000 -> ok
    ];
    const s = capStatus(lines, U(25000));
    expect(s.perLineOk).toEqual([true, false, true]);
    expect(s.paid).toBe(U(24500));
  });

  it('formatCapStatus renders a stable one-line summary', () => {
    const s = capStatus(seed(), U(25000));
    expect(formatCapStatus(s)).toMatch(/total .*24,000/);
    expect(formatCapStatus(s)).toMatch(/\[ok, ok, ok, ok, ok\]/);
  });
});

describe('computeRosterHash (matches PayrollRail.proposeRoster — invariant I3)', () => {
  const recipients = [A.dev, A.designer];
  const handleIds = [
    '0x' + '11'.repeat(32),
    '0x' + '22'.repeat(32),
  ];

  it('produces a 32-byte hex hash', () => {
    const h = computeRosterHash(recipients, handleIds);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('is deterministic', () => {
    expect(computeRosterHash(recipients, handleIds)).toBe(computeRosterHash(recipients, handleIds));
  });
  it('changes if any amount handle changes (tamper-evident)', () => {
    const a = computeRosterHash(recipients, handleIds);
    const b = computeRosterHash(recipients, ['0x' + '11'.repeat(32), '0x' + '23'.repeat(32)]);
    expect(a).not.toBe(b);
  });
  it('changes if a recipient changes', () => {
    const a = computeRosterHash(recipients, handleIds);
    const b = computeRosterHash([A.dev, A.writer], handleIds);
    expect(a).not.toBe(b);
  });
  it('is insensitive to recipient checksum casing (normalizes)', () => {
    const a = computeRosterHash([A.dev, A.designer], handleIds);
    const b = computeRosterHash([A.dev.toUpperCase().replace('0X', '0x'), A.designer], handleIds);
    expect(a).toBe(b);
  });
  it('throws on a length mismatch', () => {
    expect(() => computeRosterHash([A.dev], handleIds)).toThrow(/mismatch/i);
  });
});
