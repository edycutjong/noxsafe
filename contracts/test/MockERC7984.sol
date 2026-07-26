// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/**
 * @title MockERC7984 — LOCAL TEST DOUBLE ONLY (never deployed to Sepolia)
 * @notice A minimal confidential-token stand-in that lets PayrollRail's *logic* be unit-tested in
 *         isolation from the real wrapper's balance internals. It reproduces the two checks the rail
 *         actually depends on — the ERC-7984 operator model and the amount-handle ACL gate — exactly as
 *         the real {ERC7984Base.confidentialTransferFrom} does, and records each transfer for assertions.
 *         The real ConfidentialUSD wrapper is exercised separately in Onboarding.integration.test.js.
 */
contract MockERC7984 {
    event OperatorSet(address indexed holder, address indexed operator, uint48 until);
    event ConfidentialTransferFrom(address indexed from, address indexed to, bytes32 amount);

    mapping(address => mapping(address => uint48)) private _operators;
    mapping(address => euint256) private _balances;

    // Last-transfer record (for test assertions).
    address public lastFrom;
    address public lastTo;
    bytes32 public lastAmount;
    uint256 public transferCount;

    error NotOperator(address from, address spender);
    error NotAllowedAmount(bytes32 amount, address user);

    function setOperator(address operator, uint48 until) external {
        _operators[msg.sender][operator] = until;
        emit OperatorSet(msg.sender, operator, until);
    }

    function isOperator(address holder, address spender) public view returns (bool) {
        return holder == spender || block.timestamp <= _operators[holder][spender];
    }

    function confidentialBalanceOf(address account) external view returns (euint256) {
        return _balances[account];
    }

    /// @dev Mirrors {ERC7984Base.confidentialTransferFrom(address,address,euint256)}: caller must be an
    ///      operator for `from` AND ACL-allowed for the encrypted `amount` handle. Records the transfer.
    function confidentialTransferFrom(address from, address to, euint256 amount)
        external
        returns (euint256 transferred)
    {
        require(Nox.isAllowed(amount, msg.sender), NotAllowedAmount(euint256.unwrap(amount), msg.sender));
        require(isOperator(from, msg.sender), NotOperator(from, msg.sender));
        _balances[to] = amount; // last received (test convenience; not a real accumulator)
        lastFrom = from;
        lastTo = to;
        lastAmount = euint256.unwrap(amount);
        transferCount++;
        emit ConfidentialTransferFrom(from, to, euint256.unwrap(amount));
        return amount;
    }
}
