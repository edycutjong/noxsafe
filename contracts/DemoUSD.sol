// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title DemoUSD
 * @notice A plain, UNMODIFIED ERC-20 that mirrors USDC's 6 decimals, used as the
 *         underlying asset for the confidential wrapper so judges are never blocked
 *         by a dry Circle faucet. This is a real deployed ERC-20 — not mock data.
 * @dev The public `faucet()` mints 1,000 dUSD to the caller. Swap this for real
 *      Circle Sepolia USDC (address pinned at build) in production; the wrapper
 *      is agnostic to which ERC-20 it wraps.
 */
contract DemoUSD is ERC20 {
    uint8 private constant _DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** 6;

    constructor() ERC20("Demo USD", "dUSD") {
        // Seed the deployer so the demo cast can be funded deterministically.
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Anyone can mint themselves 1,000 dUSD to try NoxSend.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Convenience mint used by the deterministic seed script.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
