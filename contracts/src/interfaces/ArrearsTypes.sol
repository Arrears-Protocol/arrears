// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ArrearsTypes
 * @notice Shared types for Arrears. Kept in one place because the registry, the court and the
 *         credit line all reason about the same three things: who an operator is, what they
 *         promised to answer for, and what a proven failure turned out to be.
 *
 * @dev Two facts from the Phase 0 investigation shape every type here, and neither is obvious:
 *
 *      1. A reverted Ethereum transaction carries NO LOGS. Not usually -- ever. A top-level
 *         revert rolls back the EVM journal, logs included; 813 of 813 reverted mainnet
 *         transactions measured had zero logs and an all-zero bloom. The attested encoding also
 *         has no revert-reason field. So nothing in Arrears may be built on events or on a
 *         reason string. The entire evidentiary surface is: from, to, calldata, value, nonce,
 *         gasLimit, receiptStatus and receiptGasUsed.
 *
 *      2. Reverting is NORMAL -- 1.47% of mainnet transactions, roughly 26,000 a day. So
 *         "reverted" cannot mean "failed a duty". The only failure mode that is unambiguously
 *         the sender's own fault is running out of gas: the sender chose the limit, and nobody
 *         can race them into choosing it badly. That is the fault line `Verdict` draws.
 */
library ArrearsTypes {
    /// @notice What a proven source-chain transaction turned out to be, once decoded.
    /// @dev Derived entirely from `receiptStatus` and the `receiptGasUsed`/`gasLimit` pair, both
    ///      of which come out of the same bytes the block-prover precompile verified.
    enum Verdict {
        /// @dev Never stored. Guards against reading an unset slot as a real verdict.
        None,
        /// @dev `receiptStatus == 1`. The transaction succeeded. Not evidence of anything.
        Succeeded,
        /// @dev `receiptStatus == 0` and `receiptGasUsed < gasLimit`. The callee rejected the
        ///      call. Recorded against the operator's history, but NEVER slashable: the state
        ///      the operator was acting on may have moved underneath them between broadcast and
        ///      inclusion, and Arrears cannot prove it did not.
        ExplicitRevert,
        /// @dev `receiptStatus == 0` and `receiptGasUsed >= gasLimit`. Out of gas. The sender
        ///      set the limit. THE ONLY SLASHABLE CLASS. Measured at 10.3% of mainnet reverts.
        OutOfGas
    }

    /// @notice A bonded operator's identity, spanning two chains.
    /// @dev The bond lives on Creditcoin but the evidence names an Ethereum address, so the two
    ///      must be bound before any claim can be adjudicated. See
    ///      {IArrearsRegistry-registerOperator} for how that binding is proven.
    struct Operator {
        /// @dev The Creditcoin account that posted, and may withdraw, the bond.
        address controller;
        /// @dev The source-chain address whose failures this bond answers for. Compared against
        ///      the proven `commonTx.from`.
        address sourceAddress;
        /// @dev Attestcoin source-chain key. 3 = Ethereum mainnet, 1 = Sepolia.
        uint64 chainKey;
        /// @dev Total bond posted, in wei of CTC.
        uint256 bonded;
        /// @dev Portion currently earmarked by live coverage and not withdrawable.
        uint256 committed;
        /// @dev Cumulative amount slashed. Never decreases; the credit line prices off it.
        uint256 slashed;
        /// @dev CC3 timestamp from which a withdrawal request may complete. Zero when none is pending.
        uint64 withdrawableAt;
    }

    /**
     * @notice A scoped promise. The bond answers for failures inside this scope and nowhere else.
     * @dev Scope is deliberately narrow on three axes at once -- which chain, which
     *      (contract, selector) pairs, and which block window. A proof that misses on any axis
     *      is refused with {IArrearsCourt-OutOfScope} rather than being silently ignored, so a
     *      submitter always learns which axis failed.
     */
    struct Coverage {
        /// @dev The operator this coverage belongs to.
        bytes32 operatorId;
        /// @dev Source chain the window is measured on. Must match the operator's chainKey.
        uint64 chainKey;
        /// @dev First source-chain block height covered, inclusive.
        uint64 fromHeight;
        /// @dev Last source-chain block height covered, inclusive.
        uint64 toHeight;
        /// @dev Bond earmarked for this coverage. Slashes draw from it; it cannot be withdrawn
        ///      while the coverage can still be claimed against.
        uint256 committed;
        /// @dev Maximum a single claim may take, so one bad hour cannot zero a bond.
        uint256 perClaimCap;
        /// @dev CC3 timestamp after which no NEW claim may be filed. Set strictly later than the
        ///      window's real-world end so evidence that surfaces late is still admissible; an
        ///      operator must not be able to close coverage to outrun a claim.
        uint64 claimDeadline;
        /// @dev False once revoked. Revocation stops future coverage, never past liability.
        bool active;
    }

    /// @notice One (contract, selector) pair inside a coverage's scope.
    /// @dev Both halves are required. A selector alone would cover every contract that happens
    ///      to share a 4-byte prefix, which is the same class of mistake as matching an event by
    ///      signature without checking its emitter -- demonstrated live on CC3 in this repo's
    ///      impostor demo.
    struct ScopeEntry {
        /// @dev The source-chain contract the operator promised to call successfully.
        address target;
        /// @dev The function selector on that contract.
        bytes4 selector;
    }

    /// @notice A proven failure, and what was done about it.
    struct Claim {
        /// @dev keccak256(chainKey, height, txIndex) -- deterministic, so a resubmission of the
        ///      same evidence is cheap to reject and a relayer retry is safe.
        bytes32 claimId;
        bytes32 coverageId;
        bytes32 operatorId;
        uint64 chainKey;
        uint64 height;
        uint64 txIndex;
        /// @dev Proven `commonTx.to`.
        address target;
        /// @dev Proven `bytes4(commonTx.data)`.
        bytes4 selector;
        /// @dev Proven `receiptGasUsed`.
        uint64 gasUsed;
        /// @dev Proven `commonTx.gasLimit`.
        uint64 gasLimit;
        Verdict verdict;
        /// @dev Amount actually taken from the bond. Zero for every verdict but OutOfGas.
        uint256 slashed;
        /// @dev Who is credited for surfacing this. May differ from `msg.sender` so a gas-paying
        ///      relayer can submit on a claimant's behalf. See {IArrearsCourt-submitClaim}.
        address beneficiary;
        /// @dev CC3 timestamp of adjudication.
        uint64 ruledAt;
    }

    /// @notice Which axis of a coverage's scope a proof failed to match.
    /// @dev Returned by `IArrearsCourt.previewClaim` and carried by `IArrearsCourt.OutOfScope`
    ///      so a rejected submitter learns which of the four axes missed rather than being told
    ///      only that something did.
    enum ScopeMiss {
        /// @dev The proof is inside scope on every axis.
        None,
        /// @dev Proven chain key is not the coverage's chain key.
        ChainKey,
        /// @dev Proven block height falls outside [fromHeight, toHeight].
        Window,
        /// @dev Proven `commonTx.to` is not a covered contract.
        Target,
        /// @dev The contract is covered but this selector on it is not.
        Selector,
        /// @dev Proven `commonTx.from` is not the operator this coverage belongs to.
        Operator
    }

    /// @notice The terms a credit line is priced on.
    struct CreditTerms {
        /// @dev Current borrowing limit, in wei of CTC.
        uint256 limit;
        /// @dev Risk premium in basis points, added to the base rate.
        uint16 premiumBps;
        /// @dev Count of slashable failures proven against this operator.
        uint32 strikes;
        /// @dev CC3 timestamp of the most recent reprice.
        uint64 repricedAt;
    }
}
