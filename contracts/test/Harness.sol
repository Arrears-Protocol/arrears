// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {IBlockProver} from "../src/IBlockProver.sol";

/**
 * @title MockBlockProver
 * @notice Stands in for the block-prover precompile, which holds no code on a bare test EVM.
 * @dev Verifies nothing — the real precompile's verification is exercised against the live chain
 *      in phase0/probes, not here. What these tests exercise is everything Arrears does with a
 *      proof once it is verified: scope selection, classification and slashing. The mock's
 *      `txIndex` is read out of the merkle root so a test can pin it deterministically.
 */
contract MockBlockProver {
    bool public shouldVerify = true;

    function setShouldVerify(bool v) external { shouldVerify = v; }

    function calculateTxIndex(IBlockProver.MerkleProof calldata mp) external pure returns (uint64) {
        return uint64(uint256(mp.root));
    }

    function verify(uint64, uint64, bytes calldata, IBlockProver.MerkleProof calldata, IBlockProver.ContinuityProof calldata)
        external view returns (bool) { return shouldVerify; }

    function verifyAndEmit(uint64 chainKey, uint64 height, bytes calldata, IBlockProver.MerkleProof calldata mp, IBlockProver.ContinuityProof calldata)
        external returns (bool)
    {
        require(shouldVerify, "mock: proof rejected");
        emit IBlockProver.TransactionVerified(chainKey, height, uint64(uint256(mp.root)));
        return true;
    }
}

/// @notice Builds EvmV1-encoded type-2 transaction bytes, in the exact shape the real
///         `EvmV1Decoder` expects: `abi.encode(uint8 txType, bytes[3] chunks)`.
library TxBuilder {
    function encode(
        address from,
        address to,
        bytes4 selector,
        uint64 gasLimit,
        uint8 receiptStatus,
        uint64 gasUsed
    ) internal pure returns (bytes memory) {
        return encodeWithLogs(from, to, selector, gasLimit, receiptStatus, gasUsed, new EvmV1Decoder.LogEntry[](0));
    }

    function encodeWithLogs(
        address from,
        address to,
        bytes4 selector,
        uint64 gasLimit,
        uint8 receiptStatus,
        uint64 gasUsed,
        EvmV1Decoder.LogEntry[] memory logs
    ) internal pure returns (bytes memory) {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(7), gasLimit, from, false, to, uint256(0), abi.encodePacked(selector));
        chunks[1] = abi.encode(uint64(1), uint128(1 gwei), uint128(2 gwei), new EvmV1Decoder.AccessListEntry[](0), uint8(0), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(receiptStatus, gasUsed, logs, new bytes(256));
        return abi.encode(uint8(2), chunks);
    }
}
