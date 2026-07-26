// Gateway spike: prove the Nox Handle Gateway is self-serve (no account/API key/allowlist).
// Runs a REAL encryptInput against the live Sepolia gateway with the throwaway deployer wallet.
import 'dotenv/config';
import { ethers } from 'ethers';
import { createEthersHandleClient } from '@iexec-nox/handle';

const RPC = process.env.SEPOLIA_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  console.log('chainId       :', net.chainId.toString());

  const wallet = new ethers.Wallet(PK, provider);
  console.log('owner (wallet):', wallet.address);
  const bal = await provider.getBalance(wallet.address);
  console.log('balance (ETH) :', ethers.formatEther(bal));

  console.log('\n[1] createEthersHandleClient(wallet) — auto-resolve config for chainId...');
  const client = await createEthersHandleClient(wallet);
  console.log('    HandleClient created (config auto-resolved for Sepolia).');

  // applicationContract: any valid 20-byte address works for a pure gateway probe.
  const appContract = process.env.APP_CONTRACT || wallet.address;
  const amount = 1850000000n; // 1,850.00 with 6 decimals

  console.log('\n[2] encryptInput(1850e6, "uint256", appContract) -> live gateway POST /v0/secrets ...');
  const t0 = Date.now();
  const { handle, handleProof } = await client.encryptInput(amount, 'uint256', appContract);
  const dt = Date.now() - t0;

  console.log('    OK in', dt, 'ms');
  console.log('    handle      :', handle, '(', (handle.length - 2) / 2, 'bytes )');
  console.log('    handleProof :', handleProof.slice(0, 34) + '...', '(', (handleProof.length - 2) / 2, 'bytes )');
  console.log('\nGATEWAY SPIKE: GREEN — no account/API key/allowlist required.');
}

main().catch((e) => {
  console.error('\nGATEWAY SPIKE FAILED:', e?.message || e);
  if (e?.cause) console.error('cause:', e.cause?.message || e.cause);
  process.exit(1);
});
