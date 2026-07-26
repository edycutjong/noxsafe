// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    Nox,
    euint256,
    ebool,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";

/**
 * @title PayrollRail
 * @notice Confidential payroll rails for a Safe{Wallet} multisig, layered on iExec Nox
 *         confidential tokens (ERC-7984) WITHOUT modifying Safe in any way.
 *
 * ## Trust model — OPERATOR, not module
 * The rail holds ZERO Safe execution rights. It is a time-bound, revocable ERC-7984 *operator*
 * on the confidential wrapper (`cUSD.setOperator(rail, quarterEnd)`), granted and revoked by a
 * standard multisig tx (`setOperator(rail, 0)`). Worst-case blast radius is the wrapped payroll
 * float — which the app sets equal to the approved budget cap, so the worst case *is* the approved
 * spend. The Safe's unwrapped USDC is untouchable. See SPEC.md invariants I1–I4.
 *
 * ## The encrypted budget invariant (the flagship trick)
 * The cap is PUBLIC (DAOs publish budgets); line items are PRIVATE. `spent` is an encrypted
 * accumulator. Each payout computes, entirely in encrypted space:
 *     ok  = Nox.le(Nox.add(spent, amt), toEuint256(cap));   // ebool
 *     pay = Nox.select(ok, amt, ZERO);                       // over-cap line pays encrypted zero
 *     spent = Nox.add(spent, pay);
 * `Nox.allowPublicDecryption(ok)` lets ANYONE audit cap-compliance without seeing a single amount.
 * An over-cap line transfers encrypted zero — on-chain indistinguishable from a real payment.
 *
 * ## Roster lifecycle
 *     configure (onlySafe) -> proposeRoster (onlyTreasurer) -> approveRoster (onlySafe multisig tx)
 *       -> executePayroll (anyone, once approved) -> [SETTLED]
 * Owners approve WHO gets paid (recipients) + a PUBLIC cap via the roster hash — HOW MUCH stays sealed.
 *
 * ## ACL roles demonstrated (the org chart, provable on-chain)
 *  - recipient  : `addViewer(line, recipient)` at propose — decrypt-only, exactly their own line.
 *  - auditor    : `addViewer(line, auditor)` on a multisig `grantAuditor` — read-all, read-only.
 *  - officer    : `allow(line, officer)` on a multisig `grantOfficer` — ADMIN: decrypt AND extend
 *                 viewers without a new multisig round-trip. Admin grants are IRREVOCABLE by design.
 *  - public     : `allowPublicDecryption(ok)` — anyone can decrypt the cap-compliance flag.
 *  - transient  : rail -> token, single-tx, for the payout handle.
 *
 * Shared Nox-integration skeleton (wrapper, DemoUSD, handle/ACL patterns) originates in the sibling
 * NoxSend build; disclosed in README. This PayrollRail contract is NoxSafe's own novel surface.
 */
contract PayrollRail {
    // ============ Immutable wiring ============

    /// @notice The confidential wrapper token (cUSD) the rail is an operator on.
    IERC7984 public immutable cUSD;
    /// @notice The Safe{Wallet} multisig that governs this rail (the payer). UNMODIFIED Safe contract.
    address public immutable safe;

    // ============ Roles / config ============

    address public treasurer; // proposes rosters; sees plaintext amounts client-side (inherent).
    address public auditor; // last-granted read-all viewer (informational).
    address public complianceOfficer; // last-granted admin (informational).
    uint256 public cap; // PUBLIC per-quarter budget cap (base units, 6 decimals).
    bool public configured;

    /// @notice Encrypted running total of settled payouts (the budget accumulator).
    euint256 private _spent;

    // ============ Roster storage ============

    enum RosterStatus {
        None, // 0
        Proposed, // 1
        Approved, // 2
        Settled // 3
    }

    struct Line {
        address recipient;
        euint256 amount; // encrypted line amount (viewer-gated to recipient/auditor/officer)
        ebool okFlag; // cap-compliance flag, publicly decryptable after execute
    }

    struct Roster {
        RosterStatus status;
        bytes32 rosterHash; // keccak256(abi.encode(recipients, handleIds)) — approve integrity
        Line[] lines;
    }

    uint256 public rosterCount;
    mapping(uint256 => Roster) private _rosters;
    uint256[] private _settledRosters;

    // ============ Events ============

    event Configured(address indexed treasurer, uint256 cap);
    event RosterProposed(uint256 indexed id, bytes32 rosterHash, uint256 lineCount);
    event RosterApproved(uint256 indexed id);
    event Paid(uint256 indexed id, uint256 indexed index, address indexed recipient, bytes32 okHandle);
    event RosterSettled(uint256 indexed id);
    event AuditorGranted(address indexed auditor, uint256 lines);
    event OfficerGranted(address indexed officer, uint256 lines);
    event BudgetComplianceProven(bytes32 okHandle);

    // ============ Errors ============

    error NotSafe(address caller);
    error NotTreasurer(address caller);
    error NotConfigured();
    error AlreadyConfigured();
    error EmptyRoster();
    error LengthMismatch();
    error BadRosterState(uint256 id, RosterStatus have, RosterStatus want);
    error NoSettledRosters();

    // ============ Modifiers ============

    modifier onlySafe() {
        require(msg.sender == safe, NotSafe(msg.sender));
        _;
    }

    modifier onlyTreasurer() {
        require(msg.sender == treasurer, NotTreasurer(msg.sender));
        _;
    }

    constructor(IERC7984 cUSD_, address safe_) {
        cUSD = cUSD_;
        safe = safe_;
    }

    // ============ Onboarding ============

    /**
     * @notice One-call config so onboarding stays a 4-tx multisig batch
     *         (approve -> wrap -> setOperator(rail, quarterEnd) -> configure(treasurer, cap)).
     * @dev onlySafe. Initializes the encrypted `spent` accumulator to zero on first configure.
     *      `Nox.toEuint256(0)` is a PUBLIC handle (allowed to all) — do NOT `allowThis` it; it becomes
     *      a confidential rail-owned handle after the first `add`+`allowThis` in executePayroll.
     */
    function configure(address treasurer_, uint256 cap_) external onlySafe {
        treasurer = treasurer_;
        cap = cap_;
        if (!configured) {
            _spent = Nox.toEuint256(0);
            configured = true;
        }
        emit Configured(treasurer_, cap_);
    }

    // ============ Roster propose ============

    /**
     * @notice Treasurer proposes an encrypted roster. Each amount enters as an `externalEuint256`
     *         with an EIP-712 input proof bound to THIS rail (`encryptInput(amt,'uint256',rail)`).
     * @dev Per line: `fromExternal` validates the proof (grants the rail transient ACL) ->
     *      `allowThis` persists the rail's access -> `addViewer(recipient)` gives the contributor
     *      decrypt rights over exactly their line. Emits the roster hash for tamper-evident approval.
     */
    function proposeRoster(
        address[] calldata recipients,
        externalEuint256[] calldata handles,
        bytes[] calldata proofs
    ) external onlyTreasurer returns (uint256 id) {
        // No `!configured` check needed: `treasurer` is only ever set inside configure(), atomically
        // with `configured = true`, so passing onlyTreasurer already implies configured. (The directly
        // reachable NotConfigured guard lives on proveSpendWithinBudget.)
        uint256 n = recipients.length;
        if (n == 0) revert EmptyRoster();
        if (handles.length != n || proofs.length != n) revert LengthMismatch();

        id = ++rosterCount;
        Roster storage r = _rosters[id];
        r.status = RosterStatus.Proposed;

        bytes32[] memory handleIds = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            euint256 amt = Nox.fromExternal(handles[i], proofs[i]); // rail gets transient ACL
            Nox.allowThis(amt); // persist rail access across txs
            Nox.addViewer(amt, recipients[i]); // recipient can decrypt exactly their line
            r.lines.push(Line({recipient: recipients[i], amount: amt, okFlag: ebool.wrap(bytes32(0))}));
            handleIds[i] = externalEuint256.unwrap(handles[i]);
        }

        r.rosterHash = keccak256(abi.encode(recipients, handleIds));
        emit RosterProposed(id, r.rosterHash, n);
    }

    // ============ Roster approve (multisig) ============

    /// @notice Owners approve the roster id + hash via the normal Safe queue. onlySafe.
    function approveRoster(uint256 id) external onlySafe {
        Roster storage r = _rosters[id];
        if (r.status != RosterStatus.Proposed) {
            revert BadRosterState(id, r.status, RosterStatus.Proposed);
        }
        r.status = RosterStatus.Approved;
        emit RosterApproved(id);
    }

    // ============ Execute ============

    /**
     * @notice Execute an approved roster. Anyone may call once approved (the sealing already happened
     *         at propose; the multisig already approved WHO + the cap).
     * @dev The encrypted budget invariant runs per line:
     *      ok = le(add(spent, amt), cap); pay = select(ok, amt, 0); spent = add(spent, pay).
     *      Over-cap lines transfer encrypted zero. `allowPublicDecryption(ok)` publishes the
     *      cap-compliance flag; `allowTransient(pay, cUSD)` lets the token move exactly `pay`.
     */
    function executePayroll(uint256 id) external {
        Roster storage r = _rosters[id];
        if (r.status != RosterStatus.Approved) {
            revert BadRosterState(id, r.status, RosterStatus.Approved);
        }
        r.status = RosterStatus.Settled;

        euint256 budget = Nox.toEuint256(cap); // public handle
        uint256 n = r.lines.length;
        for (uint256 i = 0; i < n; i++) {
            Line storage line = r.lines[i];
            euint256 amt = line.amount;

            // --- cap enforcement, entirely in encrypted space ---
            ebool ok = Nox.le(Nox.add(_spent, amt), budget);
            euint256 pay = Nox.select(ok, amt, Nox.toEuint256(0));
            _spent = Nox.add(_spent, pay);
            Nox.allowThis(_spent); // _spent is now a confidential rail-owned accumulator

            // --- publish the compliance flag; move exactly `pay` ---
            Nox.allowPublicDecryption(ok);
            line.okFlag = ok;
            Nox.allowTransient(pay, address(cUSD));
            cUSD.confidentialTransferFrom(safe, line.recipient, pay);

            emit Paid(id, i, line.recipient, ebool.unwrap(ok));
        }

        _settledRosters.push(id);
        emit RosterSettled(id);
    }

    // ============ Disclosure grants ============

    /**
     * @notice Multisig grants an auditor VIEWER (read-all, read-only) access to every settled line.
     * @dev onlySafe. `addViewer` requires the rail to already be allowed on each handle (it is —
     *      persisted via `allowThis` at propose). Selective disclosure with zero on-chain leak.
     */
    function grantAuditor(address a) external onlySafe returns (uint256 granted) {
        uint256 s = _settledRosters.length;
        if (s == 0) revert NoSettledRosters();
        auditor = a;
        for (uint256 j = 0; j < s; j++) {
            Roster storage r = _rosters[_settledRosters[j]];
            uint256 n = r.lines.length;
            for (uint256 i = 0; i < n; i++) {
                Nox.addViewer(r.lines[i].amount, a);
                granted++;
            }
        }
        emit AuditorGranted(a, granted);
    }

    /**
     * @notice Multisig grants a compliance officer ADMIN access to every settled line.
     * @dev onlySafe. `allow` = full grant (decrypt AND extend viewers without a new multisig round-trip).
     *      ADMIN GRANTS ARE IRREVOCABLE BY DESIGN — which is exactly why this is a deliberate multisig
     *      decision. Demonstrates the admin tier of the ACL org chart, distinct from the read-only auditor.
     */
    function grantOfficer(address o) external onlySafe returns (uint256 granted) {
        uint256 s = _settledRosters.length;
        if (s == 0) revert NoSettledRosters();
        complianceOfficer = o;
        for (uint256 j = 0; j < s; j++) {
            Roster storage r = _rosters[_settledRosters[j]];
            uint256 n = r.lines.length;
            for (uint256 i = 0; i < n; i++) {
                Nox.allow(r.lines[i].amount, o);
                granted++;
            }
        }
        emit OfficerGranted(o, granted);
    }

    // ============ Cryptographic accounting proof (Tier-B, additive) ============

    /**
     * @notice Prove "total spend this quarter <= approved budget" as a single PUBLIC ebool that
     *         reveals NO line and not even the total. The institutional accounting headline.
     * @dev Anyone can call; the flag is `le(spent, cap)`. Marked publicly decryptable so any auditor,
     *      regulator, or token holder can verify budget compliance off a single handle.
     */
    function proveSpendWithinBudget() external returns (bytes32 okHandle) {
        if (!configured) revert NotConfigured();
        ebool ok = Nox.le(_spent, Nox.toEuint256(cap));
        Nox.allowPublicDecryption(ok);
        okHandle = ebool.unwrap(ok);
        emit BudgetComplianceProven(okHandle);
    }

    // ============ Views ============

    function rosterStatus(uint256 id) external view returns (RosterStatus) {
        return _rosters[id].status;
    }

    function rosterHash(uint256 id) external view returns (bytes32) {
        return _rosters[id].rosterHash;
    }

    function lineCount(uint256 id) external view returns (uint256) {
        return _rosters[id].lines.length;
    }

    function lineRecipient(uint256 id, uint256 index) external view returns (address) {
        return _rosters[id].lines[index].recipient;
    }

    /// @notice The encrypted line-amount handle (decryptable by rail/recipient/auditor/officer only).
    function lineAmountHandle(uint256 id, uint256 index) external view returns (bytes32) {
        return euint256.unwrap(_rosters[id].lines[index].amount);
    }

    /// @notice The cap-compliance flag handle for a settled line (publicly decryptable).
    function lineOkHandle(uint256 id, uint256 index) external view returns (bytes32) {
        return ebool.unwrap(_rosters[id].lines[index].okFlag);
    }

    /// @notice The encrypted running-spend accumulator handle (decryptable by the rail).
    function spentHandle() external view returns (bytes32) {
        return euint256.unwrap(_spent);
    }

    function settledRosterIds() external view returns (uint256[] memory) {
        return _settledRosters;
    }

    /// @notice Convenience: is the rail currently the operator for the Safe on cUSD?
    function isActiveOperator() external view returns (bool) {
        return cUSD.isOperator(safe, address(this));
    }
}
