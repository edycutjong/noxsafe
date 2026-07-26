import { describe, it, expect } from 'vitest';
import { isAddress, getAddress } from 'ethers';
import {
  SEPOLIA, HARDHAT, getNetwork, explorerTx, explorerAddress, CIRCLE_USDC_SEPOLIA, SEPOLIA_SHARED,
} from '../src/config.js';
import { rosterStatusName, ROSTER_STATUS } from '../src/abis.js';

describe('getNetwork', () => {
  it('resolves Sepolia by chainId', () => expect(getNetwork(11155111)).toBe(SEPOLIA));
  it('resolves Hardhat by chainId', () => expect(getNetwork(31337)).toBe(HARDHAT));
  it('throws on an unsupported chainId', () => expect(() => getNetwork(1)).toThrow(/Unsupported chainId 1/));
});

describe('network constants', () => {
  it('Sepolia noxProtocol is the pinned protocol address', () => {
    expect(SEPOLIA.noxProtocol.toLowerCase()).toBe('0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf');
  });
  it('Hardhat noxProtocol is the local canonical NoxCompute address', () => {
    expect(getAddress(HARDHAT.noxProtocol)).toBe('0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685');
  });
  it('Sepolia uses the self-serve gateway', () => {
    expect(SEPOLIA.gatewayUrl).toBe('https://gateway-testnets.noxprotocol.dev');
  });
  it('chainIds are correct', () => {
    expect(SEPOLIA.chainId).toBe(11155111);
    expect(HARDHAT.chainId).toBe(31337);
  });
});

describe('explorer link builders', () => {
  it('builds a tx link', () =>
    expect(explorerTx(SEPOLIA, '0xabc')).toBe('https://sepolia.etherscan.io/tx/0xabc'));
  it('builds an address link', () =>
    expect(explorerAddress(SEPOLIA, '0xdef')).toBe('https://sepolia.etherscan.io/address/0xdef'));
});

describe('reused shared-skeleton addresses (already live on Sepolia — do NOT redeploy)', () => {
  it('DemoUSD is a valid checksummed address', () => {
    expect(isAddress(SEPOLIA_SHARED.demoUSD)).toBe(true);
    expect(getAddress(SEPOLIA_SHARED.demoUSD)).toBe(SEPOLIA_SHARED.demoUSD);
  });
  it('ConfidentialUSD is a valid checksummed address', () => {
    expect(isAddress(SEPOLIA_SHARED.confidentialUSD)).toBe(true);
    expect(getAddress(SEPOLIA_SHARED.confidentialUSD)).toBe(SEPOLIA_SHARED.confidentialUSD);
  });
  it('Circle Sepolia USDC is a valid address', () => {
    expect(isAddress(CIRCLE_USDC_SEPOLIA)).toBe(true);
  });
});

describe('roster status names', () => {
  it('maps codes to names', () => {
    expect(rosterStatusName(0)).toBe('None');
    expect(rosterStatusName(1)).toBe('Proposed');
    expect(rosterStatusName(2)).toBe('Approved');
    expect(rosterStatusName(3)).toBe('Settled');
  });
  it('falls back to None for an out-of-range code', () => expect(rosterStatusName(9)).toBe('None'));
  it('exposes the ordered status list', () =>
    expect(ROSTER_STATUS).toEqual(['None', 'Proposed', 'Approved', 'Settled']));
});
