// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArrearsTypes} from "./interfaces/ArrearsTypes.sol";
import {IArrearsCourt} from "./interfaces/IArrearsCourt.sol";
import {IArrearsRegistry} from "./interfaces/IArrearsRegistry.sol";
import {IArrearsCreditLine} from "./interfaces/IArrearsCreditLine.sol";
import {IBlockProver, BlockProverLib} from "./IBlockProver.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

/**
 * @title ArrearsCourt
 * @notice Turns a proven Ethereum failure into a ruling against a bonded operator.
 * @dev Prove, scope-check, classify, slash. Nothing here takes anyone's word for anything except
 *      the operator's identity binding, which is a signature held by the registry and is the
 *      single trust assumption in the system.
 */
contract ArrearsCourt is IArrearsCourt {
    IBlockProver internal constant VERIFIER = IBlockProver(BlockProverLib.PRECOMPILE);

    IArrearsRegistry public immutable registry;
    IArrearsCreditLine public immutable creditLine;

    mapping(bytes32 => ArrearsTypes.Claim) private _claims;
    mapping(bytes32 => bytes32[]) private _claimsAgainst;

    /// @dev What a decoded proof reduces to. Grouped into a struct because the classification
    ///      path needs all of it at once and via-ir alone will not save a nine-local function.
    struct Decoded {
        address from;
        address target;
        bytes4 selector;
        uint64 gasLimit;
        uint8 receiptStatus;
        uint64 gasUsed;
        uint64 txIndex;
    }

    constructor(address registry_, address creditLine_) {
        registry = IArrearsRegistry(registry_);
        creditLine = IArrearsCreditLine(creditLine_);
    }

    // ── ids ──────────────────────────────────────────────────────────────────

    function claimIdOf(uint64 chainKey, uint64 height, uint64 txIndex) public pure returns (bytes32) {
        return keccak256(abi.encode(chainKey, height, txIndex));
    }

    // ── the selection rule ───────────────────────────────────────────────────

    /// @inheritdoc IArrearsCourt
    function selectCoverage(bytes32 operatorId, uint64 height, address target, bytes4 selector)
        public
        view
        returns (bytes32 coverageId)
    {
        uint64 chainKey = registry.operator(operatorId).chainKey;
        bytes32[] memory ids = registry.coveragesOf(operatorId);

        uint256 best;
        // Declaration order. `ids` is an append-only array, so this sequence is fixed by history
        // and cannot be perturbed by a caller. Ties therefore break to the earliest declared
        // simply by using a strict `>` below.
        for (uint256 i; i < ids.length; i++) {
            if (!registry.admits(ids[i], chainKey, height, target, selector)) continue;
            uint256 p = registry.payable_(ids[i]);
            if (p > best) {
                best = p;
                coverageId = ids[i];
            }
        }
        // A coverage that admits the failure but can pay nothing still loses to nothing at all.
        // That is intentional: selecting it would consume the globally unique claim id for a
        // zero slash, which is the griefing outcome the rule exists to prevent.
    }

    // ── adjudication ─────────────────────────────────────────────────────────

    function _decode(bytes calldata txBytes, IBlockProver.MerkleProof calldata mp)
        private
        view
        returns (Decoded memory d)
    {
        EvmV1Decoder.CommonTxFields memory c = EvmV1Decoder.decodeCommonTxFields(txBytes);
        EvmV1Decoder.ReceiptFields memory r = EvmV1Decoder.decodeReceiptFields(txBytes);
        d.from = c.from;
        d.target = c.to;
        d.selector = bytes4(c.data);
        d.gasLimit = c.gasLimit;
        d.receiptStatus = r.receiptStatus;
        d.gasUsed = r.receiptGasUsed;
        d.txIndex = VERIFIER.calculateTxIndex(mp);
    }

    /// @dev The fault line. `receiptStatus == 0` and `gasUsed >= gasLimit` is the sender's own
    ///      under-provisioning and nobody else's doing; every other failure is not.
    function _classify(Decoded memory d) private pure returns (ArrearsTypes.Verdict) {
        if (d.receiptStatus == 1) return ArrearsTypes.Verdict.Succeeded;
        return d.gasUsed >= d.gasLimit ? ArrearsTypes.Verdict.OutOfGas : ArrearsTypes.Verdict.ExplicitRevert;
    }

    /**
     * @dev Diagnoses WHY no coverage admitted a proof, most-general axis first, so a rejected
     *      submitter learns which single thing to change. Walks declaration order and records
     *      how far each coverage got; the earliest axis that nothing cleared is the answer.
     */
    function _scopeMiss(bytes32 operatorId, Decoded memory d, uint64 height, bytes32 coverageId)
        private
        view
        returns (ArrearsTypes.ScopeMiss)
    {
        ArrearsTypes.Operator memory o = registry.operator(operatorId);
        if (o.sourceAddress != d.from) return ArrearsTypes.ScopeMiss.Operator;
        if (coverageId != bytes32(0)) return ArrearsTypes.ScopeMiss.None;

        bytes32[] memory ids = registry.coveragesOf(operatorId);
        bool sawChain;
        bool sawWindow;
        bool sawTarget;
        bool sawSelector;
        bool sawRevoked;
        bool sawExpired;

        for (uint256 i; i < ids.length; i++) {
            ArrearsTypes.Coverage memory c = registry.coverage(ids[i]);
            if (c.chainKey != o.chainKey) continue;
            sawChain = true;
            if (height < c.fromHeight || height > c.toHeight) continue;
            sawWindow = true;
            if (!registry.coversTarget(ids[i], d.target)) continue;
            sawTarget = true;
            if (!registry.inScope(ids[i], d.target, d.selector)) continue;
            sawSelector = true;
            if (!c.active && height > c.revokedAtHeight) { sawRevoked = true; continue; }
            if (block.timestamp > c.claimDeadline) { sawExpired = true; continue; }
            // admits on every axis and is live, so the only thing left is an empty commitment
        }

        if (!sawChain) return ArrearsTypes.ScopeMiss.ChainKey;
        if (!sawWindow) return ArrearsTypes.ScopeMiss.Window;
        if (!sawTarget) return ArrearsTypes.ScopeMiss.Target;
        if (!sawSelector) return ArrearsTypes.ScopeMiss.Selector;
        if (sawRevoked) return ArrearsTypes.ScopeMiss.Revoked;
        if (sawExpired) return ArrearsTypes.ScopeMiss.Expired;
        return ArrearsTypes.ScopeMiss.Exhausted;
    }

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
        )
    {
        uint64 chainKey = registry.operator(operatorId).chainKey;
        // The precompile's `view` overload. Free, and the reason sponsored submission is safe.
        try VERIFIER.verify(chainKey, height, txBytes, merkleProof, continuityProof) returns (bool ok) {
            proofValid = ok;
        } catch {
            proofValid = false;
        }
        if (!proofValid) return (false, ArrearsTypes.Verdict.None, ArrearsTypes.ScopeMiss.None, bytes32(0), 0);

        Decoded memory d = _decode(txBytes, merkleProof);
        verdict = _classify(d);
        selectedCoverage = selectCoverage(operatorId, height, d.target, d.selector);
        miss = _scopeMiss(operatorId, d, height, selectedCoverage);
        if (miss == ArrearsTypes.ScopeMiss.None && verdict == ArrearsTypes.Verdict.OutOfGas) {
            wouldSlash = registry.payable_(selectedCoverage);
        }
    }

    function submitClaim(
        bytes32 operatorId,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof,
        address beneficiary
    ) external returns (bytes32 claimId, ArrearsTypes.Verdict verdict, uint256 slashed) {
        return _adjudicate(operatorId, height, txBytes, merkleProof, continuityProof, beneficiary, false);
    }

    function submitSlashingClaim(
        bytes32 operatorId,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof,
        address beneficiary
    ) external returns (bytes32 claimId, uint256 slashed) {
        (claimId,, slashed) = _adjudicate(operatorId, height, txBytes, merkleProof, continuityProof, beneficiary, true);
    }

    function _adjudicate(
        bytes32 operatorId,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof,
        address beneficiary,
        bool strict
    ) private returns (bytes32 claimId, ArrearsTypes.Verdict verdict, uint256 slashed) {
        uint64 chainKey = registry.operator(operatorId).chainKey;

        // 1. prove. verifyAndEmit reverts on a bad proof and emits TransactionVerified on a good one.
        if (!VERIFIER.verifyAndEmit(chainKey, height, txBytes, merkleProof, continuityProof)) revert ProofNotVerified();

        Decoded memory d = _decode(txBytes, merkleProof);

        claimId = claimIdOf(chainKey, height, d.txIndex);
        if (_claims[claimId].ruledAt != 0) revert AlreadyClaimed(claimId);

        // 2. identity, then scope. The court selects the coverage; the submitter never chooses.
        address expected = registry.operator(operatorId).sourceAddress;
        if (expected != d.from) revert WrongOperator(d.from, expected);

        bytes32 coverageId = selectCoverage(operatorId, height, d.target, d.selector);
        if (coverageId == bytes32(0)) {
            ArrearsTypes.ScopeMiss miss = _scopeMiss(operatorId, d, height, bytes32(0));
            revert OutOfScope(miss, d.target, d.selector, height);
        }

        // 3. classify.
        verdict = _classify(d);
        if (verdict == ArrearsTypes.Verdict.Succeeded) revert SourceTransactionSucceeded(d.receiptStatus);
        if (strict && verdict == ArrearsTypes.Verdict.ExplicitRevert) {
            revert NotSlashableExplicitRevert(d.gasUsed, d.gasLimit);
        }

        // 4. slash, but only the one class where fault is unambiguous.
        if (verdict == ArrearsTypes.Verdict.OutOfGas) {
            slashed = registry.slash(operatorId, coverageId, registry.payable_(coverageId));
            if (slashed == 0) revert NothingLeftToSlash(operatorId);
            creditLine.reprice(operatorId, claimId, uint64(block.timestamp));
            emit BondSlashed(operatorId, coverageId, slashed, registry.operator(operatorId).bonded);
        }

        _claims[claimId] = ArrearsTypes.Claim({
            claimId: claimId,
            coverageId: coverageId,
            operatorId: operatorId,
            chainKey: chainKey,
            height: height,
            txIndex: d.txIndex,
            target: d.target,
            selector: d.selector,
            gasUsed: d.gasUsed,
            gasLimit: d.gasLimit,
            verdict: verdict,
            slashed: slashed,
            beneficiary: beneficiary,
            ruledAt: uint64(block.timestamp)
        });
        _claimsAgainst[operatorId].push(claimId);

        emit ClaimRuled(
            claimId, operatorId, coverageId, verdict, d.target, d.selector, d.gasUsed, d.gasLimit, slashed, beneficiary
        );

        // The refusal is carried as the SELECTOR of the named error, so a client decodes it
        // against the same error list the strict path reverts with. Not a string, not a comment.
        if (verdict == ArrearsTypes.Verdict.ExplicitRevert) {
            emit SlashRefused(
                claimId, operatorId, NotSlashableExplicitRevert.selector, d.gasUsed, d.gasLimit
            );
        }
    }

    // ── views ────────────────────────────────────────────────────────────────

    function claim(bytes32 claimId) external view returns (ArrearsTypes.Claim memory) {
        return _claims[claimId];
    }

    function claimsAgainst(bytes32 operatorId) external view returns (bytes32[] memory) {
        return _claimsAgainst[operatorId];
    }
}
