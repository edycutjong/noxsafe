// Amount helpers for confidential USD (6 decimals, mirroring USDC).
export const CUSD_DECIMALS = 6;

/** Parse a human amount ("1850", "1,850.50", 1850) to base units (bigint). */
export function toBaseUnits(amount: string | number, decimals = CUSD_DECIMALS): bigint {
  const s = String(amount).trim().replace(/,/g, '');
  if (s === '' || !/^\d*(?:\.\d*)?$/.test(s) || s === '.') {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const [whole, frac = ''] = s.split('.');
  if (frac.length > decimals) {
    throw new Error(`Too many decimals: ${amount} (max ${decimals})`);
  }
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

/** Format base units (bigint) to a human string with fixed decimals. */
export function fromBaseUnits(value: bigint, decimals = CUSD_DECIMALS): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

/** Format base units with thousands separators and a currency suffix for UI. */
export function formatDisplay(value: bigint, symbol = 'cUSD', decimals = CUSD_DECIMALS): string {
  const raw = fromBaseUnits(value, decimals);
  const [whole, frac] = raw.split('.');
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${withSep}.${frac} ${symbol}`;
}
