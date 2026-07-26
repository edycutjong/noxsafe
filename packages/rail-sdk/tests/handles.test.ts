import { describe, it, expect } from 'vitest';
import {
  isHandle, handleVersion, handleChainId, handleType, handleAttribute,
  isUniqueHandle, describeHandle, SOLIDITY_TYPES,
} from '../src/handles.js';

// A real uint256 balance handle produced on live Sepolia by the e2e run.
const REAL = '0x0000aa36a72301d0a66be344b1634051873c6b66da2066be98c37424b7a6cfa3';

// Build a synthetic handle with a given type-code byte (index into SOLIDITY_TYPES) and attribute.
function synth(typeCode: number, attribute = 0, chainIdHex = 'aa36a7'): string {
  const version = '00';
  const chain = ('00' + chainIdHex).slice(-8); // 4 bytes
  const type = typeCode.toString(16).padStart(2, '0');
  const attr = attribute.toString(16).padStart(2, '0');
  return '0x' + version + chain + type + attr + '00'.repeat(25);
}

describe('isHandle', () => {
  it('accepts a 32-byte hex', () => expect(isHandle(REAL)).toBe(true));
  it('rejects wrong length', () => expect(isHandle('0x1234')).toBe(false));
  it('rejects missing 0x', () => expect(isHandle('00'.repeat(32))).toBe(false));
  it('rejects non-hex', () => expect(isHandle('0x' + 'z'.repeat(64))).toBe(false));
  it('rejects empty', () => expect(isHandle('')).toBe(false));
});

describe('handle decoding (real Sepolia handle)', () => {
  it('version = 0', () => expect(handleVersion(REAL)).toBe(0));
  it('chainId = Sepolia 11155111', () => expect(handleChainId(REAL)).toBe(11155111));
  it('type = uint256', () => expect(handleType(REAL)).toBe('uint256'));
  it('attribute = 1 (unique)', () => expect(handleAttribute(REAL)).toBe(1));
  it('isUniqueHandle = true', () => expect(isUniqueHandle(REAL)).toBe(true));
  it('describeHandle aggregates', () =>
    expect(describeHandle(REAL)).toEqual({ version: 0, chainId: 11155111, type: 'uint256', attribute: 1, unique: true }));
});

describe('type-code table', () => {
  const cases: [number, string][] = [
    [0, 'bool'], [1, 'address'], [2, 'bytes'], [3, 'string'],
    [5, 'uint16'], [35, 'uint256'], [37, 'int16'], [67, 'int256'], [99, 'bytes32'],
  ];
  for (const [code, type] of cases) {
    it(`code ${code} -> ${type}`, () => expect(handleType(synth(code))).toBe(type));
  }
  it('SOLIDITY_TYPES has 100 entries', () => expect(SOLIDITY_TYPES.length).toBe(100));
  it('throws on an unknown type code', () => expect(() => handleType(synth(200))).toThrow());
});

describe('attribute / uniqueness', () => {
  it('attribute 0 => not unique', () => expect(isUniqueHandle(synth(35, 0))).toBe(false));
  it('attribute 1 => unique', () => expect(isUniqueHandle(synth(35, 1))).toBe(true));
});

describe('chainId decoding', () => {
  it('decodes hardhat 31337', () => expect(handleChainId(synth(35, 0, '007a69'))).toBe(31337));
  it('decodes arbitrum-sepolia 421614', () => expect(handleChainId(synth(35, 0, '066eee'))).toBe(421614));
});

describe('validation', () => {
  it('handleType throws on bad handle', () => expect(() => handleType('0xdead')).toThrow());
  it('handleChainId throws on bad handle', () => expect(() => handleChainId('nope')).toThrow());
});
