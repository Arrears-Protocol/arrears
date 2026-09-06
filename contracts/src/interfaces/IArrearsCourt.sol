// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArrearsTypes} from "./ArrearsTypes.sol";
import {IBlockProver} from "../IBlockProver.sol";

/**
 * @title IArrearsCourt
 * @notice Turns a proven Ethereum failure into a ruling against a bonded operator.
 *
 * @dev The court does exactly four things, in order, and refuses loudly at each step:
 *
 *        1. Prove the source transaction through the block-prover precompile. If the proof does
 *           not verify, nothing else happens.
 *        2. Decode it and check it against the operator's declared scope -- chain, block window,
 *           and the (contract, selector) pair. Out of scope refuses with `OutOfScope`, which
 *           names the axis that missed.
 *        3. Classify the failure from `receiptStatus` and the `receiptGasUsed`/`gasLimit` pair.
 *        4. Slash only if the classification is `OutOfGas`.
 *
 *      ── On why the slashable class is narrower than the failure class ──
 *
 *      Reverting is ordinary. 1.47% of Ethereum mainnet transactions revert -- roughly 26,000 a
 *      day -- so a contract that slashed on `receiptStatus == 0` would be slashing operators for
 *      participating in DeFi. Arrears slashes only where fault is unambiguous: the transaction
 *      ran out of gas, and the sender is the party who chose the limit. Nobody can race an
 *      operator into under-provisioning their own gas. That is 10.3% of reverts.
 *
 *      An explicit revert is a different animal. The callee rejected the call, and the state it
 *      rejected against may have moved between broadcast and inclusion -- a price tick, a
 *      competing filler, a pool drained one block earlier. Arrears cannot prove from the
 *      attested bytes that it did not, because a reverted transaction carries no logs and the
 *      encoding has no revert reason. Slashing on that would be punishing operators for losing
 *      races. So explicit reverts are recorded and never slashable.
 *
 *      ── A design tension the implementation has to resolve, stated rather than hidden ──
 *
 *      "Recorded but refused" cannot be one reverting call: a revert erases the record, the
 *      emitted events, and the precompile's own `TransactionVerified` along with them. So the
 *      court offers both shapes and the caller picks:
 *
 *        `submitClaim`  -- the ledger path. Records the failure whatever it is, returns the
 *                          verdict, and for an explicit revert emits `SlashRefused` carrying the
 *                          SELECTOR of `NotSlashableExplicitRevert`. The refusal is therefore a
 *                          named error in the ABI, machine-readable on chain, not a comment.
 *
 *        `submitSlashingClaim` -- the strict path. Reverts with `NotSlashableExplicitRevert`
 *                          itself when the failure is not slashable, so a caller who only wants
 *                          to slash spends nothing on a claim that would not have slashed.
 *
 *      Both run identical checks. `previewClaim` gives the same verdict for free over `eth_call`.
 */
interface IArrearsCourt {
    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice A proven failure was recorded, whatever its verdict.
    event ClaimRuled(
        bytes32 indexed claimId,
        bytes32 indexed operatorId,
        bytes32 indexed coverageId,
        ArrearsTypes.Verdict verdict,
        address target,
        bytes4 selector,
        uint64 gasUsed,
        uint64 gasLimit,
        uint256 slashed,
        address beneficiary
    );

    /**
     * @notice A recorded failure was found not slashable.
     * @param reason The 4-byte selector of the error type that names the refusal -- currently
     *               always `NotSlashableExplicitRevert.selector`. Carrying the selector rather
     *               than a string keeps the reason in the ABI, where a client can decode it
     *               against the same error list the strict path reverts with.
     */
    event SlashRefused(bytes32 indexed claimId, bytes32 indexed operatorId, bytes4 reason, uint64 gasUsed, uint64 gasLimit);

    event BondSlashed(bytes32 indexed operatorId, bytes32 indexed coverageId, uint256 amount, uint256 remaining);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The block-prover precompile did not verify the proof.
    error ProofNotVerified();

    /**
     * @notice The proven transaction is outside the coverage's declared scope.
     * @dev Distinct from every other refusal, and names which of the four axes missed so a
     *      submitter is never left guessing.
     */
    error OutOfScope(ArrearsTypes.ScopeMiss miss, address target, bytes4 selector, uint64 height);

    /// @notice The proven transaction succeeded. Not evidence of anything.
    error SourceTransactionSucceeded(uint8 receiptStatus);

    /**
     * @notice The proven transaction failed, but by explicit revert rather than out of gas.
     * @dev THE named error for the non-slashable class. Reverted with by `submitSlashingClaim`;
     *      its selector is carried by `SlashRefused` on the recording path.
     */
    error NotSlashableExplicitRevert(uint64 gasUsed, uint64 gasLimit);

    /// @notice The proven `commonTx.from` is not the operator this coverage belongs to.
    error WrongOperator(address proven, address expected);

    error AlreadyClaimed(bytes32 claimId);
    error CoverageInactive(bytes32 coverageId);
    /// @notice The operator has no coverage at all that admits this proof.
    error NoCoveringCoverage(bytes32 operatorId, address target, bytes4 selector, uint64 height);
    error ClaimWindowClosed(uint64 claimDeadline, uint64 nowTs);
    error NothingLeftToSlash(bytes32 operatorId);

    // ─────────────────────────────────────────────────────────────────────────
    // Submission
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Prove a source-chain failure and record the ruling. Permissionless.
     *
     * @dev Permissionless by design, and that is what makes relayer-sponsored submission work
     *      without any meta-transaction machinery: a claim's validity comes entirely from the
     *      proof, never from who carried it. `beneficiary` exists so the account that paid the
     *      gas and the account credited with surfacing the failure can differ -- a relayer
     *      submits, a claimant is credited.
     *
     *      Claim ids are deterministic in (chainKey, height, txIndex), so a duplicate is
     *      refused cheaply with `AlreadyClaimed` and a relayer retrying a transaction it is
     *      unsure landed cannot double-rule.
     *
     *      ── Why this takes an operatorId and not a coverageId ──
     *
     *      An earlier shape let the submitter name the coverage. That was a griefing vector: an
     *      operator holding two overlapping coverages could be claimed against the one with the
     *      smaller `perClaimCap`, consuming the globally unique claim id and capping the slash
     *      far below what the other coverage would have paid. The submitter no longer chooses.
     *      The court selects, by the fixed rule in `selectCoverage`.
     *
     * @param beneficiary Credited with the claim. Pass `msg.sender` for self-submission.
     * @return claimId The deterministic claim id.
     * @return verdict What the evidence turned out to be.
     * @return slashed Amount taken from the bond. Zero unless `verdict == OutOfGas`.
     */
    function submitClaim(
        bytes32 operatorId,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof,
        address beneficiary
    ) external returns (bytes32 claimId, ArrearsTypes.Verdict verdict, uint256 slashed);

    /**
     * @notice As `submitClaim`, but reverts rather than recording when the failure is not
     *         slashable.
     * @dev For callers who only want to slash. Reverts `NotSlashableExplicitRevert` on an
     *      explicit revert and `SourceTransactionSucceeded` on a success, leaving no record.
     */
    function submitSlashingClaim(
        bytes32 operatorId,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof,
        address beneficiary
    ) external returns (bytes32 claimId, uint256 slashed);

    /**
     * @notice Classify a proof without spending gas or touching state.
     * @dev Uses the precompile's `view` overload `verify`, which the SDK's own vendored
     *      interface omits, so a full dry run costs nothing over `eth_call`. Front-ends and
     *      relayers should always call this first: it turns every refusal into a free answer
     *      and keeps sponsored submission from paying for claims that would be rejected.
     */
    function previewClaim(
        bytes32 operatorId,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof
    )
        external
        view
        returns (
            bool proofValid,
            ArrearsTypes.Verdict verdict,
            ArrearsTypes.ScopeMiss miss,
            bytes32 selectedCoverage,
            uint256 wouldSlash
        );

    /**
     * @notice The coverage the court will use for a given failure. Deterministic, and public so
     *         an operator can see their own exposure before it is used against them.
     *
     * @dev THE SELECTION RULE, fixed and total:
     *
     *        1. Consider every coverage of `operatorId`, in declaration order. Declaration order
     *           is an append-only array, never a mapping, so iteration order is fixed by history
     *           and cannot be perturbed by anything a caller does.
     *        2. Keep those that admit the failure on all four axes: chain key, block window,
     *           target contract, selector. A revoked coverage is still kept if the failure
     *           happened inside its window and its claim deadline has not passed.
     *        3. Of those, take the one whose PAYABLE AMOUNT is largest, where payable is
     *           `min(perClaimCap, committed - alreadyDrawn)` — what the coverage would actually
     *           pay, not what it nominally promises.
     *        4. Ties break to the EARLIEST declared.
     *
     *      Step 3 chooses the largest rather than the smallest deliberately. It makes an
     *      operator's liability MONOTONIC in the coverage they declare: adding a coverage can
     *      only ever increase what a given failure costs them, never decrease it. Under an
     *      earliest-declared rule the reverse holds — an operator could declare a token
     *      coverage with a one-wei cap on day one and shelter every later, larger promise behind
     *      it. Widest-payable closes that, and because the court and not the submitter applies
     *      it, it closes the griefing direction at the same time.
     *
     *      Using payable rather than nominal `perClaimCap` matters once a coverage has been
     *      drawn down: a coverage promising a large cap over an exhausted commitment would win
     *      the comparison and then pay almost nothing.
     *
     * @return coverageId The selected coverage, or `bytes32(0)` if none admits the failure.
     */
    function selectCoverage(bytes32 operatorId, uint64 height, address target, bytes4 selector)
        external
        view
        returns (bytes32 coverageId);

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function claim(bytes32 claimId) external view returns (ArrearsTypes.Claim memory);
    function claimIdOf(uint64 chainKey, uint64 height, uint64 txIndex) external pure returns (bytes32);
    function claimsAgainst(bytes32 operatorId) external view returns (bytes32[] memory);
}
