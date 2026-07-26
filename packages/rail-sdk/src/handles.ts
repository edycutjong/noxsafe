// Nox handle decoding. A handle is a 32-byte value whose header encodes metadata:
//   byte[0]     = version
//   byte[1..4]  = chainId (big-endian uint32)
//   byte[5]     = solidity type code (index into SOLIDITY_TYPES)
//   byte[6]     = attribute (1 => "unique" handle, e.g. a fresh mint/burn output)
// Layout mirrors @iexec-nox/handle's internal encoding.

export const SOLIDITY_TYPES = [
  'bool', 'address', 'bytes', 'string',
  'uint8', 'uint16', 'uint24', 'uint32', 'uint40', 'uint48', 'uint56', 'uint64',
  'uint72', 'uint80', 'uint88', 'uint96', 'uint104', 'uint112', 'uint120', 'uint128',
  'uint136', 'uint144', 'uint152', 'uint160', 'uint168', 'uint176', 'uint184', 'uint192',
  'uint200', 'uint208', 'uint216', 'uint224', 'uint232', 'uint240', 'uint248', 'uint256',
  'int8', 'int16', 'int24', 'int32', 'int40', 'int48', 'int56', 'int64',
  'int72', 'int80', 'int88', 'int96', 'int104', 'int112', 'int120', 'int128',
  'int136', 'int144', 'int152', 'int160', 'int168', 'int176', 'int184', 'int192',
  'int200', 'int208', 'int216', 'int224', 'int232', 'int240', 'int248', 'int256',
  'bytes1', 'bytes2', 'bytes3', 'bytes4', 'bytes5', 'bytes6', 'bytes7', 'bytes8',
  'bytes9', 'bytes10', 'bytes11', 'bytes12', 'bytes13', 'bytes14', 'bytes15', 'bytes16',
  'bytes17', 'bytes18', 'bytes19', 'bytes20', 'bytes21', 'bytes22', 'bytes23', 'bytes24',
  'bytes25', 'bytes26', 'bytes27', 'bytes28', 'bytes29', 'bytes30', 'bytes31', 'bytes32',
] as const;

export type SolidityType = (typeof SOLIDITY_TYPES)[number];

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export function isHandle(value: string): boolean {
  return typeof value === 'string' && HEX32.test(value);
}

function assertHandle(handle: string): void {
  if (!isHandle(handle)) throw new Error(`Invalid handle (expected 32-byte hex): ${handle}`);
}

/** byte offset i (0-based) as a 2-char hex substring. */
function byteAt(handle: string, i: number): string {
  return handle.slice(2 + i * 2, 2 + (i + 1) * 2);
}

export function handleVersion(handle: string): number {
  assertHandle(handle);
  return parseInt(byteAt(handle, 0), 16);
}

export function handleChainId(handle: string): number {
  assertHandle(handle);
  return parseInt(handle.slice(2 + 1 * 2, 2 + 5 * 2), 16);
}

export function handleType(handle: string): SolidityType {
  assertHandle(handle);
  const code = parseInt(byteAt(handle, 5), 16);
  const t = SOLIDITY_TYPES[code];
  if (!t) throw new Error(`Unknown handle type code: ${code}`);
  return t;
}

export function handleAttribute(handle: string): number {
  assertHandle(handle);
  return parseInt(byteAt(handle, 6), 16);
}

/** A "unique" handle is a fresh on-chain result (mint/burn output) — safe to key a mapping by. */
export function isUniqueHandle(handle: string): boolean {
  return handleAttribute(handle) === 1;
}

export interface HandleInfo {
  version: number;
  chainId: number;
  type: SolidityType;
  attribute: number;
  unique: boolean;
}

export function describeHandle(handle: string): HandleInfo {
  return {
    version: handleVersion(handle),
    chainId: handleChainId(handle),
    type: handleType(handle),
    attribute: handleAttribute(handle),
    unique: isUniqueHandle(handle),
  };
}
