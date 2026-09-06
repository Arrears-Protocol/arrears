// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArrearsTypes} from "./ArrearsTypes.sol";

/**
 * @title IArrearsCreditLine
 * @notice Reprices an operator's credit line when a failure is proven against them.
 *
 * @dev This is the half of Arrears that makes the evidence matter. A slash takes money once; a
 *      reprice changes the cost of every future borrowing, which is what a credit record
 *      actually is.
 *
 *      Repricing is a `pure` function of the operator's proven history, exposed separately from
 *      the state-changing path. That is deliberate: an operator, a lender, or a judge can call
 *      `quote` and check for themselves that the number the contract applied is the number the
 *      rule produces. A pricing rule nobody can independently evaluate is an oracle, and Arrears
 *      is trying not to be one.
 *
 *      The reach of that history is unusual and worth stating. Attestcoin's provable-history
 *      floor for Ethereum mainnet is block 0, so an operator's record has no rolling window
 *      unless Arrears imposes one. A failure from 2018 is as provable as one from this morning;
 *      it costs roughly 3-6x more gas because continuity proofs lengthen as checkpoints thin
 *      out, and the worst case measured was still 0.632% of a CC3 block. Whether the pricing
 *      rule SHOULD weight a 2018 failure like a recent one is a policy question, not a technical
 *      one -- `decayHalfLifeSeconds` exists so that policy is explicit and adjustable rather
 *      than an accident of what happens to be cheap to prove.
 */
interface IArrearsCreditLine {
    event LineOpened(bytes32 indexed operatorId, uint256 limit, uint16 premiumBps);
    event LineRepriced(
        bytes32 indexed operatorId,
        bytes32 indexed claimId,
        uint256 oldLimit,
        uint256 newLimit,
        uint16 oldPremiumBps,
        uint16 newPremiumBps,
        uint32 strikes
    );
    event LineClosed(bytes32 indexed operatorId, uint32 strikes);

    error NotCourt(address caller);
    error LineNotOpen(bytes32 operatorId);
    error LineAlreadyOpen(bytes32 operatorId);

    /// @notice Open a line for a bonded operator at the base terms.
    function openLine(bytes32 operatorId, uint256 limit, uint16 premiumBps) external;

    /**
     * @notice Apply a proven slashable failure to an operator's terms.
     * @dev Court-only. Called from the same transaction that slashed, so the ruling and the
     *      reprice are atomic -- there is no window in which a slash is visible but the credit
     *      line still shows the old price.
     */
    function reprice(bytes32 operatorId, bytes32 claimId, uint64 failureTimestamp) external
        returns (ArrearsTypes.CreditTerms memory);

    /**
     * @notice What the rule says the terms should be, for a given history. Verifiable by anyone.
     * @param baseLimit    The line's limit before any strikes.
     * @param basePremiumBps The premium before any strikes.
     * @param strikes      Count of proven slashable failures.
     * @param secondsSinceLast Age of the most recent slashable failure.
     */
    function quote(uint256 baseLimit, uint16 basePremiumBps, uint32 strikes, uint64 secondsSinceLast)
        external
        view
        returns (uint256 limit, uint16 premiumBps);

    /// @notice Half-life over which a strike's weight decays. Zero means strikes never decay.
    function decayHalfLifeSeconds() external view returns (uint64);

    function terms(bytes32 operatorId) external view returns (ArrearsTypes.CreditTerms memory);
}
