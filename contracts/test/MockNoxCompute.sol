// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {TEEType} from "@iexec-nox/nox-protocol-contracts/contracts/utils/TypeUtils.sol";

/**
 * @title MockNoxCompute — LOCAL TEST DOUBLE ONLY (never deployed to Sepolia)
 * @notice A faithful local stand-in for the Nox TEE protocol contract (`NoxCompute`) so the REAL
 *         PayrollRail + ConfidentialUSD wrapper bytecode can be unit-tested on the free, ephemeral
 *         Hardhat network with ZERO gas. It reproduces the two behaviours the rail's *logic* depends on:
 *
 *           1. Deterministic handle generation (same metadata layout as the real contract:
 *              [0]=version [1-4]=chainId [5]=TEEType [6]=attrs [7-31]=hash). Every operation returns a
 *              fresh, correctly-typed, unique handle and emits the matching event.
 *           2. The exact ACL state machine (transient / persistent-admin / viewer / public-decryptable)
 *              with the real access gates (`onlyAllowed`, `notPublicHandle`, public-handle bypass).
 *
 *         What it deliberately RELAXES vs the real contract: the gateway EIP-712 signature check in
 *         `validateInputProof` / `validateDecryptionProof` (there is no TEE/gateway locally), and it does
 *         NOT compute plaintext values (the TEE does that off-chain). Therefore local tests assert on
 *         CONTRACT LOGIC — state machine, access control, roster-hash integrity, ACL exactness, event
 *         emission, and the le->select->allowThis->allowTransient->transferFrom orchestration — while the
 *         plaintext-value correctness ("designer decrypts 4,200", "cap checks true x5 + false x1") is a
 *         Sepolia e2e assertion against the real gateway (`scripts/e2e.mjs`).
 *
 *         Address note: the Nox library hardcodes `0x75C6…C685` as the compute contract for chainId 31337,
 *         so tests deploy this mock then `hardhat_setCode` its runtime to that address (see test/helpers.js).
 *         This contract has no constructor state or immutables, so a setCode relocation is exact.
 */
contract MockNoxCompute {
    // ---- Handle metadata ----
    uint8 private constant HANDLE_VERSION = 0;
    bytes1 private constant ATTR_UNIQUE = 0x01; // confidential/unique handle (has ACL)
    bytes1 private constant ATTR_PUBLIC = 0x00; // public handle (no ACL, anyone decrypts)
    uint8 private constant T_BOOL = uint8(TEEType.Bool); // 0
    uint8 private constant T_U256 = uint8(TEEType.Uint256); // 35

    uint256 private _seed;

    // ---- ACL storage (persistent; the real contract uses TSTORE for transient, collapsed here) ----
    mapping(bytes32 => mapping(address => bool)) private _transientAcl;
    mapping(bytes32 => mapping(address => bool)) private _admin; // persistent admin (allow / allowThis)
    mapping(bytes32 => mapping(address => bool)) private _viewers; // addViewer
    mapping(bytes32 => bool) private _public; // allowPublicDecryption

    // ---- Errors (names mirror INoxCompute) ----
    error UnauthorizedSender(address sender);
    error NotAllowed(bytes32 handle, address account);
    error PublicHandleACLForbidden();
    error UndefinedHandle();
    error InvalidProof(bytes proof, string reason);
    error InvalidZeroAddress();

    // ---- Events (mirror INoxCompute) ----
    event Allowed(address indexed sender, address indexed account, bytes32 indexed handle);
    event ViewerAdded(address indexed sender, address indexed viewer, bytes32 indexed handle);
    event MarkedAsPubliclyDecryptable(address indexed sender, bytes32 indexed handle);
    event WrapAsPublicHandle(address indexed caller, bytes32 plaintext, TEEType toType, bytes32 result);
    event Add(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Sub(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Mul(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Div(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Le(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Lt(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Ge(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Gt(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Eq(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Ne(address indexed caller, bytes32 a, bytes32 b, bytes32 result);
    event Select(address indexed caller, bytes32 c, bytes32 t, bytes32 f, bytes32 result);
    event SafeAdd(address indexed caller, bytes32 a, bytes32 b, bytes32 success, bytes32 result);
    event SafeSub(address indexed caller, bytes32 a, bytes32 b, bytes32 success, bytes32 result);
    event SafeMul(address indexed caller, bytes32 a, bytes32 b, bytes32 success, bytes32 result);
    event SafeDiv(address indexed caller, bytes32 a, bytes32 b, bytes32 success, bytes32 result);
    event Transfer(address indexed caller, bytes32 f, bytes32 t, bytes32 amt, bytes32 s, bytes32 nf, bytes32 nt);
    event Mint(address indexed caller, bytes32 to, bytes32 amt, bytes32 ts, bytes32 s, bytes32 nb, bytes32 nts);
    event Burn(address indexed caller, bytes32 f, bytes32 amt, bytes32 ts, bytes32 s, bytes32 nb, bytes32 nts);

    // ==================== Handle utils (mirror HandleUtils) ====================

    function _isPublic(bytes32 handle) internal pure returns (bool) {
        return (handle[6] & ATTR_UNIQUE) == 0;
    }

    function _gen(uint8 opcode, bytes32[] memory operands, uint8 teeType, uint8 outputIndex, uint256 uniqueSeed, bytes1 attrs)
        internal
        view
        returns (bytes32 result)
    {
        result = keccak256(abi.encode(opcode, operands, address(this), uniqueSeed, outputIndex));
        result = result >> (7 * 8);
        result = result | bytes32(bytes1(HANDLE_VERSION));
        result = result | (bytes32(bytes4(uint32(block.chainid))) >> (1 * 8));
        result = result | (bytes32(bytes1(teeType)) >> (5 * 8));
        result = result | (bytes32(attrs) >> (6 * 8));
    }

    function _unique(uint8 opcode, bytes32[] memory operands, uint8 teeType, uint8 outputIndex) internal returns (bytes32 r) {
        r = _gen(opcode, operands, teeType, outputIndex, ++_seed, ATTR_UNIQUE);
        _grantTransient(r, msg.sender);
    }

    // ==================== ACL internals ====================

    function _isAllowed(bytes32 handle, address account) internal view returns (bool) {
        return _isPublic(handle) || _transientAcl[handle][account] || _admin[handle][account];
    }

    function _grantTransient(bytes32 handle, address account) internal {
        if (_isPublic(handle)) return; // public handles need no ACL
        _transientAcl[handle][account] = true;
    }

    function _requireDefined(bytes32[] memory operands) internal pure {
        for (uint256 i = 0; i < operands.length; i++) {
            if (operands[i] == bytes32(0)) revert UndefinedHandle();
        }
    }

    function _requireAllowedAll(bytes32[] memory operands) internal view {
        for (uint256 i = 0; i < operands.length; i++) {
            if (!_isAllowed(operands[i], msg.sender)) revert NotAllowed(operands[i], msg.sender);
        }
    }

    function _twoOperandGuard(bytes32 a, bytes32 b) internal view {
        bytes32[] memory ops = new bytes32[](2);
        ops[0] = a;
        ops[1] = b;
        _requireDefined(ops);
        _requireAllowedAll(ops);
    }

    // ==================== Compute: trivial encryption + proofs ====================

    function wrapAsPublicHandle(bytes32 value, TEEType teeType) external returns (bytes32 result) {
        bytes32[] memory ops = new bytes32[](1);
        ops[0] = value;
        result = _gen(0, ops, uint8(teeType), 0, 0, ATTR_PUBLIC); // deterministic public handle
        emit WrapAsPublicHandle(msg.sender, value, teeType, result);
    }

    /// @dev RELAXED vs real: skips the gateway EIP-712 signature (no TEE locally). Grants the caller
    ///      transient access to the input handle, exactly like the real proof-validation path does.
    function validateInputProof(bytes32 handle, address owner, bytes calldata proof, TEEType) external {
        if (handle == bytes32(0)) revert InvalidProof(proof, "zero handle");
        if (proof.length == 0) revert InvalidProof(proof, "empty proof");
        owner; // unused locally
        _grantTransient(handle, msg.sender);
    }

    /// @dev RELAXED vs real: returns the plaintext embedded after a 65-byte signature prefix without
    ///      verifying the gateway signature. Layout mirrors the real compact proof: sig(65) || plaintext.
    function validateDecryptionProof(bytes32, bytes calldata decryptionProof) external pure returns (bytes memory) {
        require(decryptionProof.length >= 65, "proof too short");
        return decryptionProof[65:];
    }

    // ==================== Compute: arithmetic ====================

    function add(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(1, _ops2(a, b), T_U256, 0);
        emit Add(msg.sender, a, b, r);
    }

    function sub(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(2, _ops2(a, b), T_U256, 0);
        emit Sub(msg.sender, a, b, r);
    }

    function mul(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(3, _ops2(a, b), T_U256, 0);
        emit Mul(msg.sender, a, b, r);
    }

    function div(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(4, _ops2(a, b), T_U256, 0);
        emit Div(msg.sender, a, b, r);
    }

    function safeAdd(bytes32 a, bytes32 b) external returns (bytes32 success, bytes32 result) {
        _twoOperandGuard(a, b);
        result = _unique(5, _ops2(a, b), T_U256, 0);
        success = _unique(5, _ops2(a, b), T_BOOL, 1);
        emit SafeAdd(msg.sender, a, b, success, result);
    }

    function safeSub(bytes32 a, bytes32 b) external returns (bytes32 success, bytes32 result) {
        _twoOperandGuard(a, b);
        result = _unique(6, _ops2(a, b), T_U256, 0);
        success = _unique(6, _ops2(a, b), T_BOOL, 1);
        emit SafeSub(msg.sender, a, b, success, result);
    }

    function safeMul(bytes32 a, bytes32 b) external returns (bytes32 success, bytes32 result) {
        _twoOperandGuard(a, b);
        result = _unique(7, _ops2(a, b), T_U256, 0);
        success = _unique(7, _ops2(a, b), T_BOOL, 1);
        emit SafeMul(msg.sender, a, b, success, result);
    }

    function safeDiv(bytes32 a, bytes32 b) external returns (bytes32 success, bytes32 result) {
        _twoOperandGuard(a, b);
        result = _unique(8, _ops2(a, b), T_U256, 0);
        success = _unique(8, _ops2(a, b), T_BOOL, 1);
        emit SafeDiv(msg.sender, a, b, success, result);
    }

    // ==================== Compute: comparisons ====================

    function eq(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(10, _ops2(a, b), T_BOOL, 0);
        emit Eq(msg.sender, a, b, r);
    }

    function ne(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(11, _ops2(a, b), T_BOOL, 0);
        emit Ne(msg.sender, a, b, r);
    }

    function lt(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(12, _ops2(a, b), T_BOOL, 0);
        emit Lt(msg.sender, a, b, r);
    }

    function le(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(13, _ops2(a, b), T_BOOL, 0);
        emit Le(msg.sender, a, b, r);
    }

    function gt(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(14, _ops2(a, b), T_BOOL, 0);
        emit Gt(msg.sender, a, b, r);
    }

    function ge(bytes32 a, bytes32 b) external returns (bytes32 r) {
        _twoOperandGuard(a, b);
        r = _unique(15, _ops2(a, b), T_BOOL, 0);
        emit Ge(msg.sender, a, b, r);
    }

    // ==================== Compute: select ====================

    function select(bytes32 condition, bytes32 ifTrue, bytes32 ifFalse) external returns (bytes32 r) {
        bytes32[] memory ops = new bytes32[](3);
        ops[0] = condition;
        ops[1] = ifTrue;
        ops[2] = ifFalse;
        _requireDefined(ops);
        _requireAllowedAll(ops);
        r = _unique(9, ops, T_U256, 0);
        emit Select(msg.sender, condition, ifTrue, ifFalse, r);
    }

    // ==================== Compute: transfer / mint / burn ====================

    function transfer(bytes32 balanceFrom, bytes32 balanceTo, bytes32 amount)
        external
        returns (bytes32 success, bytes32 newBalanceFrom, bytes32 newBalanceTo)
    {
        bytes32[] memory ops = _ops3(balanceFrom, balanceTo, amount);
        _requireDefined(ops);
        _requireAllowedAll(ops);
        newBalanceFrom = _unique(16, ops, T_U256, 0);
        newBalanceTo = _unique(16, ops, T_U256, 1);
        success = _unique(16, ops, T_BOOL, 2);
        emit Transfer(msg.sender, balanceFrom, balanceTo, amount, success, newBalanceFrom, newBalanceTo);
    }

    function mint(bytes32 balanceTo, bytes32 amount, bytes32 totalSupply)
        external
        returns (bytes32 success, bytes32 newBalanceTo, bytes32 newTotalSupply)
    {
        bytes32[] memory ops = _ops3(balanceTo, amount, totalSupply);
        _requireDefined(ops);
        _requireAllowedAll(ops);
        newBalanceTo = _unique(17, ops, T_U256, 0);
        newTotalSupply = _unique(17, ops, T_U256, 1);
        success = _unique(17, ops, T_BOOL, 2);
        emit Mint(msg.sender, balanceTo, amount, totalSupply, success, newBalanceTo, newTotalSupply);
    }

    function burn(bytes32 balanceFrom, bytes32 amount, bytes32 totalSupply)
        external
        returns (bytes32 success, bytes32 newBalanceFrom, bytes32 newTotalSupply)
    {
        bytes32[] memory ops = _ops3(balanceFrom, amount, totalSupply);
        _requireDefined(ops);
        _requireAllowedAll(ops);
        newBalanceFrom = _unique(18, ops, T_U256, 0);
        newTotalSupply = _unique(18, ops, T_U256, 1);
        success = _unique(18, ops, T_BOOL, 2);
        emit Burn(msg.sender, balanceFrom, amount, totalSupply, success, newBalanceFrom, newTotalSupply);
    }

    // ==================== ACL ====================

    function allow(bytes32 handle, address account) external {
        if (account == address(0)) revert InvalidZeroAddress();
        if (_isPublic(handle)) revert PublicHandleACLForbidden();
        if (!_isAllowed(handle, msg.sender)) revert UnauthorizedSender(msg.sender);
        _admin[handle][account] = true;
        emit Allowed(msg.sender, account, handle);
    }

    function allowTransient(bytes32 handle, address account) external {
        if (account == address(0)) revert InvalidZeroAddress();
        if (_isPublic(handle)) revert PublicHandleACLForbidden();
        if (!_isAllowed(handle, msg.sender)) revert UnauthorizedSender(msg.sender);
        _transientAcl[handle][account] = true;
    }

    function disallowTransient(bytes32 handle, address account) external {
        if (account == address(0)) revert InvalidZeroAddress();
        if (_isPublic(handle)) revert PublicHandleACLForbidden();
        if (!_isAllowed(handle, msg.sender)) revert UnauthorizedSender(msg.sender);
        _transientAcl[handle][account] = false;
    }

    function addViewer(bytes32 handle, address viewer) external {
        if (viewer == address(0)) revert InvalidZeroAddress();
        if (_isPublic(handle)) revert PublicHandleACLForbidden();
        if (!_isAllowed(handle, msg.sender)) revert UnauthorizedSender(msg.sender);
        _viewers[handle][viewer] = true;
        emit ViewerAdded(msg.sender, viewer, handle);
    }

    function allowPublicDecryption(bytes32 handle) external {
        if (_isPublic(handle)) revert PublicHandleACLForbidden();
        if (!_isAllowed(handle, msg.sender)) revert UnauthorizedSender(msg.sender);
        _public[handle] = true;
        emit MarkedAsPubliclyDecryptable(msg.sender, handle);
    }

    // ==================== ACL views ====================

    function isAllowed(bytes32 handle, address account) external view returns (bool) {
        return _isAllowed(handle, account);
    }

    function isViewer(bytes32 handle, address viewer) external view returns (bool) {
        return _isPublic(handle) || _public[handle] || _viewers[handle][viewer] || _admin[handle][viewer];
    }

    function isPubliclyDecryptable(bytes32 handle) external view returns (bool) {
        return _isPublic(handle) || _public[handle];
    }

    function validateAllowedForAll(address account, bytes32[] calldata handles) external view {
        for (uint256 i = 0; i < handles.length; i++) {
            if (!_isAllowed(handles[i], account)) revert NotAllowed(handles[i], account);
        }
    }

    // ==================== helpers ====================

    function _ops2(bytes32 a, bytes32 b) private pure returns (bytes32[] memory ops) {
        ops = new bytes32[](2);
        ops[0] = a;
        ops[1] = b;
    }

    function _ops3(bytes32 a, bytes32 b, bytes32 c) private pure returns (bytes32[] memory ops) {
        ops = new bytes32[](3);
        ops[0] = a;
        ops[1] = b;
        ops[2] = c;
    }
}
