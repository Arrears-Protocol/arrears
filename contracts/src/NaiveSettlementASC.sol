// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBlockProver, BlockProverLib} from "./IBlockProver.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

/**
 * @title NaiveSettlementASC
 * @notice An Attestcoin Smart Contract written the way the documented Readability pattern
 *         describes it, and WRONG because of what that pattern does not mention.
 *
 * The documented flow is: prove the source-chain transaction with the Block Prover Precompile,
 * decode it with EvmV1Decoder, then act on the decoded data. This contract does exactly that
 * and nothing more. It is not a strawman -- every line follows the guidance.
 *
 * The defect: `EvmV1Decoder.decodeReceiptFields(txBytes).receiptStatus` is never read. The
 * precompile verifies that a transaction was *included in a block*, which is not the same
 * claim as the transaction having *succeeded*. A transaction that reverted on Ethereum mainnet
 * is just as provable as one that succeeded, and this contract cannot tell them apart.
 *
 * `strictRecordSettlement` is the same function with the one missing guard, deployed alongside
 * so the difference can be demonstrated on the same proof in the same block.
 */
contract NaiveSettlementASC {
    IBlockProver internal constant VERIFIER = IBlockProver(BlockProverLib.PRECOMPILE);

    mapping(bytes32 => bool) public settled;

    event SettlementAccepted(
        bytes32 indexed key, uint64 indexed chainKey, uint64 height,
        address payer, address target, uint256 value, bytes4 selector, uint64 gasUsed
    );

    error AlreadySettled();
    error NotProven();
    /// @notice Raised only by the strict variant: the proven transaction failed on the source chain.
    error SourceTransactionReverted(uint8 receiptStatus, uint64 gasUsed, uint64 gasLimit);

    /// @notice THE NAIVE PATH. Proves inclusion, decodes, acts. Never checks receiptStatus.
    function recordSettlement(
        uint64 chainKey,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof
    ) external returns (bytes32 key) {
        if (!VERIFIER.verifyAndEmit(chainKey, height, txBytes, merkleProof, continuityProof)) revert NotProven();

        EvmV1Decoder.CommonTxFields memory c = EvmV1Decoder.decodeCommonTxFields(txBytes);
        EvmV1Decoder.ReceiptFields memory r = EvmV1Decoder.decodeReceiptFields(txBytes);
        // ^ decoded purely so the event can report gasUsed. receiptStatus is NEVER consulted.

        key = keccak256(abi.encode(chainKey, height, c.from, c.nonce));
        if (settled[key]) revert AlreadySettled();
        settled[key] = true;

        emit SettlementAccepted(
            key, chainKey, height, c.from, c.to, c.value, bytes4(c.data), r.receiptGasUsed
        );
    }

    /// @notice THE FIX. Identical, plus the three lines the pattern omits.
    function strictRecordSettlement(
        uint64 chainKey,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof
    ) external returns (bytes32 key) {
        if (!VERIFIER.verifyAndEmit(chainKey, height, txBytes, merkleProof, continuityProof)) revert NotProven();

        EvmV1Decoder.CommonTxFields memory c = EvmV1Decoder.decodeCommonTxFields(txBytes);
        EvmV1Decoder.ReceiptFields memory r = EvmV1Decoder.decodeReceiptFields(txBytes);

        if (r.receiptStatus != 1) {
            revert SourceTransactionReverted(r.receiptStatus, r.receiptGasUsed, c.gasLimit);
        }

        key = keccak256(abi.encode(chainKey, height, c.from, c.nonce));
        if (settled[key]) revert AlreadySettled();
        settled[key] = true;

        emit SettlementAccepted(
            key, chainKey, height, c.from, c.to, c.value, bytes4(c.data), r.receiptGasUsed
        );
    }
}
