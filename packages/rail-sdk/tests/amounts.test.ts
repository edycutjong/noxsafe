import { describe, it, expect } from 'vitest';
import { toBaseUnits, fromBaseUnits, formatDisplay, CUSD_DECIMALS } from '../src/amounts.js';

describe('toBaseUnits', () => {
  it('parses whole numbers', () => expect(toBaseUnits('1850')).toBe(1_850_000_000n));
  it('parses decimals', () => expect(toBaseUnits('1850.50')).toBe(1_850_500_000n));
  it('parses full precision', () => expect(toBaseUnits('0.000001')).toBe(1n));
  it('parses zero', () => expect(toBaseUnits('0')).toBe(0n));
  it('parses a number argument', () => expect(toBaseUnits(1850)).toBe(1_850_000_000n));
  it('strips thousands commas', () => expect(toBaseUnits('1,850,000.25')).toBe(1_850_000_250_000n));
  it('trims whitespace', () => expect(toBaseUnits('  42  ')).toBe(42_000_000n));
  it('handles a bare leading dot', () => expect(toBaseUnits('.5')).toBe(500_000n));
  it('handles trailing dot digits', () => expect(toBaseUnits('12.')).toBe(12_000_000n));
  it('rejects too many decimals', () => expect(() => toBaseUnits('1.1234567')).toThrow());
  it('rejects non-numeric', () => expect(() => toBaseUnits('abc')).toThrow());
  it('rejects multiple dots', () => expect(() => toBaseUnits('1.2.3')).toThrow());
  it('rejects a lone dot', () => expect(() => toBaseUnits('.')).toThrow());
  it('respects a custom decimals arg', () => expect(toBaseUnits('1.5', 2)).toBe(150n));
  it('uses 6 decimals by default', () => expect(CUSD_DECIMALS).toBe(6));
});

describe('fromBaseUnits', () => {
  it('formats whole', () => expect(fromBaseUnits(1_850_000_000n)).toBe('1850.000000'));
  it('formats smallest unit', () => expect(fromBaseUnits(1n)).toBe('0.000001'));
  it('formats zero', () => expect(fromBaseUnits(0n)).toBe('0.000000'));
  it('formats negatives', () => expect(fromBaseUnits(-1_500_000n)).toBe('-1.500000'));
  it('respects custom decimals', () => expect(fromBaseUnits(150n, 2)).toBe('1.50'));
});

describe('formatDisplay', () => {
  it('adds thousands separators + symbol', () => expect(formatDisplay(1_850_000_000n)).toBe('1,850.000000 cUSD'));
  it('formats large values', () => expect(formatDisplay(1_234_567_000_000n)).toBe('1,234,567.000000 cUSD'));
  it('accepts a custom symbol', () => expect(formatDisplay(120_000_000n, 'dUSD')).toBe('120.000000 dUSD'));
});

describe('roundtrip', () => {
  for (const s of ['0', '1', '1850', '1850.50', '0.000001', '9999999.999999']) {
    it(`toBaseUnits/fromBaseUnits roundtrips ${s}`, () => {
      const parsed = Number(fromBaseUnits(toBaseUnits(s)));
      expect(parsed).toBeCloseTo(Number(s), 6);
    });
  }
});
