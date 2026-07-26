// Network + contract configuration. The gateway/subgraph/protocol values match @iexec-nox/handle's
// built-in Sepolia config; contract addresses come from your deployment (deployments.json).

export interface NoxNetwork {
  chainId: number;
  name: string;
  rpcUrl: string;
  gatewayUrl: string;
  subgraphUrl: string;
  /** NoxCompute protocol contract (ACL + proof validation). */
  noxProtocol: string;
  explorer: string;
}

export const SEPOLIA: NoxNetwork = {
  chainId: 11155111,
  name: 'sepolia',
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  gatewayUrl: 'https://gateway-testnets.noxprotocol.dev',
  subgraphUrl:
    'https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo',
  // iExec Nox protocol (NoxCompute) on Sepolia — CANONICAL EXTERNAL INFRA, pinned by iExec (not a
  // NoxSafe deployment). Verify at https://docs.iex.ec.
  noxProtocol: '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf',
  explorer: 'https://sepolia.etherscan.io',
};

/** The local Hardhat network. `Nox.noxComputeContract()` resolves NoxCompute to a fixed address here. */
export const HARDHAT: NoxNetwork = {
  chainId: 31337,
  name: 'hardhat',
  rpcUrl: 'http://127.0.0.1:8545',
  gatewayUrl: 'http://127.0.0.1:0',
  subgraphUrl: '',
  // CANONICAL local Nox infra: the deterministic address the Nox library resolves NoxCompute to on a
  // fresh Hardhat node (the local counterpart of Sepolia's 0x24ef…). Not a NoxSafe deployment.
  noxProtocol: '0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685',
  explorer: '',
};

export const NETWORKS: Record<number, NoxNetwork> = {
  [SEPOLIA.chainId]: SEPOLIA,
  [HARDHAT.chainId]: HARDHAT,
};

export function getNetwork(chainId: number): NoxNetwork {
  const n = NETWORKS[chainId];
  if (!n) {
    const supported = Object.keys(NETWORKS).join(', ');
    throw new Error(`Unsupported chainId ${chainId}. Supported: ${supported}.`);
  }
  return n;
}

export interface NoxSafeContracts {
  /** Confidential wrapper token (cUSD). */
  confidentialUSD: string;
  /** The PayrollRail (the time-bound ERC-7984 operator). */
  payrollRail: string;
  /** Underlying ERC-20 (DemoUSD or Circle USDC). */
  underlying: string;
  /** The Safe{Wallet} multisig that governs the rail (the payer). */
  safe?: string;
}

export interface NoxSafeConfig {
  network: NoxNetwork;
  contracts: NoxSafeContracts;
}

export function explorerTx(net: NoxNetwork, hash: string): string {
  return `${net.explorer}/tx/${hash}`;
}
export function explorerAddress(net: NoxNetwork, address: string): string {
  return `${net.explorer}/address/${address}`;
}

/**
 * Circle USDC on Ethereum Sepolia — the documented primary asset (demo defaults to DemoUSD).
 * CANONICAL EXTERNAL token minted by Circle — pinned in code, not a NoxSafe deployment.
 */
export const CIRCLE_USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

/**
 * Demo-only defaults for the already-live shared skeleton on Sepolia — REUSED by NoxSafe (do NOT
 * redeploy). These are NoxSafe's OWN deployed contracts; the repo-root `deployments.json` is the
 * authoritative source of truth. They are duplicated here ONLY so the SDK stays standalone-importable
 * (the published package ships `src` only and must not read the repo layout / a JSON outside it).
 * Runtime callers pass addresses from deployments.json into `NoxSafeContracts`; keep these in sync.
 */
export const SEPOLIA_SHARED = {
  demoUSD: '0x486c4B8009ACf0BfE26268512F27200e48BD735C',
  confidentialUSD: '0x82C281D7403e44d61968c2F49751a56877468991',
} as const;
