// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20ToERC7984Wrapper} from
    "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";

/**
 * @title ConfidentialUSD (cUSD)
 * @notice A 1:1, redeemable confidential wrapper around an unmodified ERC-20 (USDC or DemoUSD).
 *         Balances and transfer amounts are encrypted `euint256` handles processed inside the
 *         iExec Nox TEE. The underlying ERC-20 is held by this contract 1:1 and released only
 *         against a valid TEE decryption proof via the two-step unwrap (`unwrap` -> `finalizeUnwrap`).
 * @dev The entire contract is this constructor — wrap / unwrap / finalizeUnwrap / confidentialTransfer /
 *      confidentialTransferAndCall / ACL are all inherited from the audited Nox library. The protocol
 *      itself is never modified: privacy is layered on top of the token you already hold.
 */
contract ConfidentialUSD is ERC20ToERC7984Wrapper {
    constructor(IERC20 underlying)
        ERC20ToERC7984Wrapper("Confidential USD", "cUSD", "", underlying)
    {}
}
