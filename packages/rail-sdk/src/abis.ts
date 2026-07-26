// Minimal human-readable ABIs for the NoxSafe contracts + the Nox protocol ACL surface.
// Encrypted types (euint256 / externalEuint256 / ebool) are bytes32 on the wire.

export const PAYROLL_RAIL_ABI = [
  // wiring / config
  'function cUSD() view returns (address)',
  'function safe() view returns (address)',
  'function treasurer() view returns (address)',
  'function auditor() view returns (address)',
  'function complianceOfficer() view returns (address)',
  'function cap() view returns (uint256)',
  'function configured() view returns (bool)',
  'function rosterCount() view returns (uint256)',
  'function configure(address treasurer, uint256 cap)',
  // roster lifecycle
  'function proposeRoster(address[] recipients, bytes32[] handles, bytes[] proofs) returns (uint256 id)',
  'function approveRoster(uint256 id)',
  'function executePayroll(uint256 id)',
  'function grantAuditor(address a) returns (uint256 granted)',
  'function grantOfficer(address o) returns (uint256 granted)',
  'function proveSpendWithinBudget() returns (bytes32 okHandle)',
  // views
  'function rosterStatus(uint256 id) view returns (uint8)',
  'function rosterHash(uint256 id) view returns (bytes32)',
  'function lineCount(uint256 id) view returns (uint256)',
  'function lineRecipient(uint256 id, uint256 index) view returns (address)',
  'function lineAmountHandle(uint256 id, uint256 index) view returns (bytes32)',
  'function lineOkHandle(uint256 id, uint256 index) view returns (bytes32)',
  'function spentHandle() view returns (bytes32)',
  'function settledRosterIds() view returns (uint256[])',
  'function isActiveOperator() view returns (bool)',
  // events
  'event Configured(address indexed treasurer, uint256 cap)',
  'event RosterProposed(uint256 indexed id, bytes32 rosterHash, uint256 lineCount)',
  'event RosterApproved(uint256 indexed id)',
  'event Paid(uint256 indexed id, uint256 indexed index, address indexed recipient, bytes32 okHandle)',
  'event RosterSettled(uint256 indexed id)',
  'event AuditorGranted(address indexed auditor, uint256 lines)',
  'event OfficerGranted(address indexed officer, uint256 lines)',
  'event BudgetComplianceProven(bytes32 okHandle)',
] as const;

export const CONFIDENTIAL_USD_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function underlying() view returns (address)',
  'function confidentialBalanceOf(address account) view returns (bytes32)',
  'function confidentialTotalSupply() view returns (bytes32)',
  'function wrap(address to, uint256 amount) returns (bytes32)',
  'function unwrap(address from, address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)',
  'function finalizeUnwrap(bytes32 unwrapRequestId, bytes decryptedAmountAndProof)',
  'function confidentialTransfer(address to, bytes32 amount) returns (bytes32)',
  'function confidentialTransferFrom(address from, address to, bytes32 amount) returns (bytes32)',
  'function setOperator(address operator, uint48 until)',
  'function isOperator(address holder, address spender) view returns (bool)',
  'event OperatorSet(address indexed holder, address indexed operator, uint48 until)',
  'event ConfidentialTransfer(address indexed from, address indexed to, bytes32 indexed amount)',
  'event UnwrapRequested(address indexed to, bytes32 unwrapAmount)',
] as const;

export const DEMO_USD_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function faucet()',
  'function mint(address to, uint256 amount)',
  'function FAUCET_AMOUNT() view returns (uint256)',
] as const;

// The NoxCompute protocol contract: ACL reads/writes used by the /verify inspector + auditor grant.
export const NOX_PROTOCOL_ABI = [
  'function isViewer(bytes32 handle, address viewer) view returns (bool)',
  'function isAllowed(bytes32 handle, address account) view returns (bool)',
  'function isPubliclyDecryptable(bytes32 handle) view returns (bool)',
  'function addViewer(bytes32 handle, address viewer)',
  'function allow(bytes32 handle, address account)',
  'function allowPublicDecryption(bytes32 handle)',
  'event ViewerAdded(address indexed sender, address indexed viewer, bytes32 indexed handle)',
  'event Allowed(address indexed sender, address indexed account, bytes32 indexed handle)',
  'event MarkedAsPubliclyDecryptable(address indexed sender, bytes32 indexed handle)',
] as const;

/** Roster lifecycle states (mirrors PayrollRail.RosterStatus). */
export const ROSTER_STATUS = ['None', 'Proposed', 'Approved', 'Settled'] as const;
export type RosterStatusName = (typeof ROSTER_STATUS)[number];
export function rosterStatusName(code: number): RosterStatusName {
  return ROSTER_STATUS[code] ?? 'None';
}
