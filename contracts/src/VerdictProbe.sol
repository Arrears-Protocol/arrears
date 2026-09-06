// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArrearsTypes} from "./interfaces/ArrearsTypes.sol";
import {ArrearsVerdict} from "./ArrearsVerdict.sol";
import {IBlockProver, BlockProverLib} from "./IBlockProver.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

/**
 * @title VerdictProbe
 * @notice A public, permissionless, read-only window onto Arrears' classification.
 *
 * @dev This is what the mainnet evidence gallery reads. It proves a source-chain transaction
 *      through the block-prover precompile's `view` overload and classifies it with
 *      `ArrearsVerdict` — the same library `ArrearsCourt` uses to reach a ruling.
 *
 *      It deliberately has no registry, no bond and no scope. Those exist so a slash lands on
 *      the right party, and no bond can honestly attach to a mainnet address whose key nobody
 *      here holds. What the gallery demonstrates is the half that does not need a bond:
 *      that the verification and classification path gives the right answer against real
 *      failures at real scale. The Sepolia demo demonstrates the other half end to end.
 *
 *      Everything here is `view`, so anyone can read the gallery for free, forever, without an
 *      account.
 */
contract VerdictProbe {
    IBlockProver internal constant VERIFIER = IBlockProver(BlockProverLib.PRECOMPILE);

    struct Reading {
        bool proofValid;
        ArrearsTypes.Verdict verdict;
        uint8 receiptStatus;
        uint64 gasUsed;
        uint64 gasLimit;
        uint256 logCount;
        address from;
        address target;
        bytes4 selector;
        uint64 txIndex;
    }

    /**
     * @notice Prove and classify a source-chain transaction. Free, and open to anyone.
     * @dev Returns `proofValid = false` rather than reverting when the precompile refuses, so a
     *      gallery can render a failed proof as a result instead of an exception.
     */
    function read(
        uint64 chainKey,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof
    ) external view returns (Reading memory out) {
        try VERIFIER.verify(chainKey, height, txBytes, merkleProof, continuityProof) returns (bool ok) {
            out.proofValid = ok;
        } catch {
            out.proofValid = false;
        }
        if (!out.proofValid) return out;

        (out.verdict, out.receiptStatus, out.gasUsed, out.gasLimit, out.logCount) =
            ArrearsVerdict.classifyEncoded(txBytes);

        EvmV1Decoder.CommonTxFields memory c = EvmV1Decoder.decodeCommonTxFields(txBytes);
        out.from = c.from;
        out.target = c.to;
        out.selector = bytes4(c.data);
        out.txIndex = VERIFIER.calculateTxIndex(merkleProof);
    }

    /// @notice Classify already-decoded values, without a proof. For cross-checking only.
    function classify(uint8 receiptStatus, uint64 gasUsed, uint64 gasLimit)
        external
        pure
        returns (ArrearsTypes.Verdict)
    {
        return ArrearsVerdict.classify(receiptStatus, gasUsed, gasLimit);
    }
}
