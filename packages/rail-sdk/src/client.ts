// NoxSafeClient — the ethers-based high-level surface over @iexec-nox/handle used by the CLI + scripts.
// Framework-agnostic (Node/CLI). This is where the real multisig flow runs (`npm run e2e:safe`); the
// static Safe App storyboard shares only the pure helpers (amounts/handles/acl/roster/abis), not a live
// gateway. Mirrors the proven NoxSend client shape (shared skeleton, disclosed).
import { Contract, ZeroHash, type Signer } from 'ethers';
import { PAYROLL_RAIL_ABI, CONFIDENTIAL_USD_ABI, DEMO_USD_ABI, NOX_PROTOCOL_ABI, rosterStatusName } from './abis.js';
import type { NoxSafeConfig } from './config.js';
import { toBaseUnits } from './amounts.js';
import { computeRosterHash, type RosterLine } from './roster.js';

const RETRYABLE =
  /not yet computed|not a viewer|access denied|not authorized|does not exist|rpc error|status: 40[34]|fetch failed|network request failed/i;

export async function withRetry<T>(fn: () => Promise<T>, attempts = 18, delayMs = 4000): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === attempts || !RETRYABLE.test((e as Error)?.message || '')) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

export interface HandleClientLike {
  encryptInput(
    value: bigint,
    solidityType: string,
    applicationContract: string
  ): Promise<{ handle: string; handleProof: string }>;
  decrypt(handle: string): Promise<{ value: bigint; solidityType: string }>;
  publicDecrypt(handle: string): Promise<{ value: bigint; solidityType: string; decryptionProof: string }>;
  viewACL(handle: string): Promise<unknown>;
}

export interface ProposeResult {
  id: bigint;
  rosterHash: string;
  handleIds: string[];
  txHash: string;
}

export class NoxSafeClient {
  readonly signer: Signer;
  readonly handle: HandleClientLike;
  readonly config: NoxSafeConfig;
  readonly rail: Contract;
  readonly cUSD: Contract;
  readonly underlying: Contract;
  readonly nox: Contract;

  constructor(signer: Signer, handle: HandleClientLike, config: NoxSafeConfig) {
    this.signer = signer;
    this.handle = handle;
    this.config = config;
    this.rail = new Contract(config.contracts.payrollRail, PAYROLL_RAIL_ABI as unknown as string[], signer);
    this.cUSD = new Contract(config.contracts.confidentialUSD, CONFIDENTIAL_USD_ABI as unknown as string[], signer);
    this.underlying = new Contract(config.contracts.underlying, DEMO_USD_ABI as unknown as string[], signer);
    this.nox = new Contract(config.network.noxProtocol, NOX_PROTOCOL_ABI as unknown as string[], signer);
  }

  get address(): Promise<string> {
    return this.signer.getAddress();
  }

  private get railAddress(): string {
    return this.config.contracts.payrollRail;
  }

  // ============ Onboarding (Safe-side; scripted here, one multisig batch in the Safe App) ============

  /** Wrap `amount` (human units) of the underlying ERC-20 into cUSD (approve + wrap). */
  async wrapFloat(amount: string | number): Promise<string> {
    const to = await this.address;
    const units = toBaseUnits(amount);
    await (await this.underlying.approve(this.config.contracts.confidentialUSD, units)).wait();
    const tx = await this.cUSD.wrap(to, units);
    await tx.wait();
    return tx.hash;
  }

  /** Grant the rail a time-bound operator on cUSD (`until` = quarter-end unix seconds). */
  async setOperator(until: number): Promise<string> {
    const tx = await this.cUSD.setOperator(this.railAddress, until);
    await tx.wait();
    return tx.hash;
  }

  /** Revoke the rail (one tx) — `setOperator(rail, 0)`. */
  async revokeOperator(): Promise<string> {
    const tx = await this.cUSD.setOperator(this.railAddress, 0);
    await tx.wait();
    return tx.hash;
  }

  /** Configure the rail (treasurer + public budget cap). onlySafe. */
  async configure(treasurer: string, cap: string | number): Promise<string> {
    const tx = await this.rail.configure(treasurer, toBaseUnits(cap));
    await tx.wait();
    return tx.hash;
  }

  // ============ Roster (treasurer-side) ============

  /**
   * Encrypt each line amount (concurrently, bound to the rail) and propose the roster. The returned
   * rosterHash is computed client-side identically to the contract — a local approval-integrity check.
   */
  async proposeRoster(lines: RosterLine[]): Promise<ProposeResult> {
    const recipients = lines.map((l) => l.recipient);
    const encs = await Promise.all(
      lines.map((l) => this.handle.encryptInput(l.amount, 'uint256', this.railAddress))
    );
    const handles = encs.map((e) => e.handle);
    const proofs = encs.map((e) => e.handleProof);
    const id: bigint = await this.rail.proposeRoster.staticCall(recipients, handles, proofs);
    const tx = await this.rail.proposeRoster(recipients, handles, proofs);
    await tx.wait();
    return { id, rosterHash: computeRosterHash(recipients, handles), handleIds: handles, txHash: tx.hash };
  }

  /** Owners approve the roster via the normal Safe queue. onlySafe. */
  async approveRoster(id: bigint | number): Promise<string> {
    const tx = await this.rail.approveRoster(id);
    await tx.wait();
    return tx.hash;
  }

  /** Execute an approved roster (anyone). */
  async executePayroll(id: bigint | number): Promise<string> {
    const tx = await this.rail.executePayroll(id);
    await tx.wait();
    return tx.hash;
  }

  // ============ Disclosure (multisig) ============

  async grantAuditor(auditor: string): Promise<string> {
    const tx = await this.rail.grantAuditor(auditor);
    await tx.wait();
    return tx.hash;
  }

  async grantOfficer(officer: string): Promise<string> {
    const tx = await this.rail.grantOfficer(officer);
    await tx.wait();
    return tx.hash;
  }

  async proveSpendWithinBudget(): Promise<{ okHandle: string; txHash: string }> {
    const okHandle: string = await this.rail.proveSpendWithinBudget.staticCall();
    const tx = await this.rail.proveSpendWithinBudget();
    await tx.wait();
    return { okHandle, txHash: tx.hash };
  }

  // ============ Reads / decryption ============

  async rosterStatus(id: bigint | number): Promise<string> {
    const code: bigint = await this.rail.rosterStatus(id);
    return rosterStatusName(Number(code));
  }

  async lineAmountHandle(id: bigint | number, index: number): Promise<string> {
    return this.rail.lineAmountHandle(id, index);
  }

  async lineOkHandle(id: bigint | number, index: number): Promise<string> {
    return this.rail.lineOkHandle(id, index);
  }

  /** Decrypt a line amount as an authorized viewer (recipient / auditor / officer). Retries on ACL lag. */
  async decryptLine(id: bigint | number, index: number): Promise<bigint> {
    const h: string = await this.rail.lineAmountHandle(id, index);
    if (h === ZeroHash) return 0n;
    const { value } = await withRetry(() => this.handle.decrypt(h));
    return value;
  }

  /** Public-decrypt a line's cap-compliance flag (for /verify: true x5 + false x1). */
  async publicDecryptOk(id: bigint | number, index: number): Promise<boolean> {
    const h: string = await this.rail.lineOkHandle(id, index);
    const { value } = await withRetry(() => this.handle.publicDecrypt(h));
    return value !== 0n;
  }

  /** Read + decrypt a confidential cUSD balance (defaults to signer). Uninitialized => 0. */
  async decryptBalance(address?: string): Promise<bigint> {
    const who = address ?? (await this.address);
    const h: string = await this.cUSD.confidentialBalanceOf(who);
    if (h === ZeroHash) return 0n;
    const { value } = await withRetry(() => this.handle.decrypt(h));
    return value;
  }

  // ============ ACL inspection (for /verify + auditor/officer panels) ============

  async isViewer(handle: string, account: string): Promise<boolean> {
    return this.nox.isViewer(handle, account);
  }
  async isAllowed(handle: string, account: string): Promise<boolean> {
    return this.nox.isAllowed(handle, account);
  }
  async isPubliclyDecryptable(handle: string): Promise<boolean> {
    return this.nox.isPubliclyDecryptable(handle);
  }
  async viewACL(handle: string): Promise<unknown> {
    return this.handle.viewACL(handle);
  }
}
