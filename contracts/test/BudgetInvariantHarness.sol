// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256, ebool} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/**
 * @title BudgetInvariantHarness — LOCAL TEST DOUBLE ONLY
 * @notice Exposes the two candidate encrypted budget-cap strategies as single-tx callables so the
 *         Day-5 "which primitive wins" comparison suite (BUILD_PLAN + feedback.md) can exercise both
 *         against the same inputs. The shipped rail uses Strategy A (`le`+`select`).
 *
 *   Strategy A (shipped): ok = le(spent+amt, cap); pay = select(ok, amt, 0)
 *       -> directly yields the CLAMPED payout (amt when within budget, encrypted 0 when over).
 *   Strategy B (alt):     (ok, _rem) = safeSub(cap, spent+amt); pay = select(ok, amt, 0)
 *       -> safeSub's success flag doubles as the cap check, but its numeric output is the REMAINING
 *          budget, not the payout, so a `select` is still required — one extra op, same privacy.
 *
 * Finding (feedback.md): for the exact "pay amt-or-zero under a public cap" invariant, `le`+`select`
 * is the tighter fit (2 compute ops + the accumulator add) and reads more directly than `safeSub`.
 */
contract BudgetInvariantHarness {
    /// @dev Strategy A — the shipped path. Returns the (public-marked) ok + pay handles for inspection.
    function runLeSelect(uint256 spent, uint256 amt, uint256 cap)
        external
        returns (bytes32 okHandle, bytes32 payHandle)
    {
        euint256 s = Nox.toEuint256(spent);
        euint256 a = Nox.toEuint256(amt);
        euint256 c = Nox.toEuint256(cap);
        ebool ok = Nox.le(Nox.add(s, a), c);
        euint256 pay = Nox.select(ok, a, Nox.toEuint256(0));
        Nox.allowPublicDecryption(ok);
        Nox.allowThis(pay);
        return (ebool.unwrap(ok), euint256.unwrap(pay));
    }

    /// @dev Strategy B — the safeSub alternative. Same privacy, one extra op for the same clamped payout.
    function runSafeSub(uint256 spent, uint256 amt, uint256 cap)
        external
        returns (bytes32 okHandle, bytes32 payHandle)
    {
        euint256 s = Nox.toEuint256(spent);
        euint256 a = Nox.toEuint256(amt);
        euint256 c = Nox.toEuint256(cap);
        (ebool ok, ) = Nox.safeSub(c, Nox.add(s, a)); // ok == "cap - (spent+amt) did not underflow"
        euint256 pay = Nox.select(ok, a, Nox.toEuint256(0));
        Nox.allowPublicDecryption(ok);
        Nox.allowThis(pay);
        return (ebool.unwrap(ok), euint256.unwrap(pay));
    }
}
