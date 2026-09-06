// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBlockProver, BlockProverLib} from "./IBlockProver.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

/**
 * @title NaiveEventASC
 * @notice A second Attestcoin Smart Contract following the documented Readability pattern:
 *         "listen for the emission of events on the source chain which are relevant to their
 *         dApp", prove the transaction containing that event, then "extract the relevant event".
 *
 * This contract believes it is watching one specific token. It proves a source-chain
 * transaction, walks the proven receipt's logs, and accepts the first one whose topic[0]
 * matches `Transfer(address,address,uint256)`.
 *
 * The defect: it never compares `log.address_` against the token it thinks it is watching.
 * The proof is sound -- that log really was emitted, in that transaction, in that block. The
 * inference is not: ANY contract on the source chain can emit that signature with any
 * arguments it likes, and this contract will credit it to the token it trusts.
 *
 * The filtering loop below is byte-for-byte the logic of the SDK's own
 * `EvmV1Decoder.getLogsByEventSignature`, which also matches on topics[0] alone and never
 * reads the emitter. That helper is not dispatchable in the library deployed on CC3
 * (14 of its 16 ABI functions are), so a developer reaching for it writes this loop instead.
 *
 * `strictRecordTransfer` is the same function with the one missing comparison.
 */
contract NaiveEventASC {
    IBlockProver internal constant VERIFIER = IBlockProver(BlockProverLib.PRECOMPILE);

    bytes32 public constant TRANSFER_SIG = keccak256("Transfer(address,address,uint256)");

    /// @notice The token this contract believes it is watching.
    address public immutable expectedToken;

    event TransferAccepted(
        uint64 indexed chainKey, uint64 indexed height,
        address indexed emitter, address from, address to, uint256 amount, bool emitterWasExpected
    );

    error NotProven();
    error NoMatchingEvent();
    /// @notice Raised only by the strict variant: the event came from the wrong contract.
    error WrongEmitter(address got, address expected);

    constructor(address expectedToken_) { expectedToken = expectedToken_; }

    /// @notice THE NAIVE PATH. Matches on event signature. Never checks who emitted it.
    function recordTransfer(
        uint64 chainKey,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof
    ) external {
        if (!VERIFIER.verifyAndEmit(chainKey, height, txBytes, merkleProof, continuityProof)) revert NotProven();

        EvmV1Decoder.ReceiptFields memory r = EvmV1Decoder.decodeReceiptFields(txBytes);

        for (uint256 i; i < r.receiptLogs.length; i++) {
            EvmV1Decoder.LogEntry memory l = r.receiptLogs[i];
            // The SDK helper's exact predicate: topics[0] only.
            if (l.topics.length >= 3 && l.topics[0] == TRANSFER_SIG) {
                emit TransferAccepted(
                    chainKey, height, l.address_,
                    address(uint160(uint256(l.topics[1]))),
                    address(uint160(uint256(l.topics[2]))),
                    abi.decode(l.data, (uint256)),
                    l.address_ == expectedToken
                );
                return;
            }
        }
        revert NoMatchingEvent();
    }

    /// @notice THE FIX. One added comparison.
    function strictRecordTransfer(
        uint64 chainKey,
        uint64 height,
        bytes calldata txBytes,
        IBlockProver.MerkleProof calldata merkleProof,
        IBlockProver.ContinuityProof calldata continuityProof
    ) external {
        if (!VERIFIER.verifyAndEmit(chainKey, height, txBytes, merkleProof, continuityProof)) revert NotProven();

        EvmV1Decoder.ReceiptFields memory r = EvmV1Decoder.decodeReceiptFields(txBytes);

        for (uint256 i; i < r.receiptLogs.length; i++) {
            EvmV1Decoder.LogEntry memory l = r.receiptLogs[i];
            if (l.topics.length >= 3 && l.topics[0] == TRANSFER_SIG) {
                if (l.address_ != expectedToken) revert WrongEmitter(l.address_, expectedToken);
                emit TransferAccepted(
                    chainKey, height, l.address_,
                    address(uint160(uint256(l.topics[1]))),
                    address(uint160(uint256(l.topics[2]))),
                    abi.decode(l.data, (uint256)), true
                );
                return;
            }
        }
        revert NoMatchingEvent();
    }
}
