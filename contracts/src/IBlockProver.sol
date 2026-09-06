// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IBlockProver
/// @notice The FULL block-prover precompile interface at 0x0000000000000000000000000000000000000FD2,
/// as declared by the ABI the Attestcoin SDK ships in src/block-prover/block_prover.json.
/// @dev The vendored copy in the usc-contracts package exposes only single `verify` and calls
/// itself "lean". All five functions below respond on CC3 testnet. The two array overloads
/// are the on-chain batch forms; both cap at 10 legs (measured, receipt-backed).
interface IBlockProver {
    struct MerkleProofEntry { bytes32 hash; bool isLeft; }
    struct MerkleProof { bytes32 root; MerkleProofEntry[] siblings; }
    struct ContinuityProof { bytes32 lowerEndpointDigest; bytes32[] roots; }

    event TransactionVerified(uint64 indexed chainKey, uint64 indexed height, uint64 txIndex);

    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);

    function verify(
        uint64 chainKey, uint64 height, bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof, ContinuityProof calldata continuityProof
    ) external view returns (bool);

    function verify(
        uint64 chainKey, uint64[] calldata heights, bytes[] calldata encodedTransactions,
        MerkleProof[] calldata merkleProofs, ContinuityProof calldata continuityProof
    ) external view returns (bool);

    function verifyAndEmit(
        uint64 chainKey, uint64 height, bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof, ContinuityProof calldata continuityProof
    ) external returns (bool);

    function verifyAndEmit(
        uint64 chainKey, uint64[] calldata heights, bytes[] calldata encodedTransactions,
        MerkleProof[] calldata merkleProofs, ContinuityProof calldata continuityProof
    ) external returns (bool);
}

library BlockProverLib {
    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000FD2;
    function verifier() internal pure returns (IBlockProver) { return IBlockProver(PRECOMPILE); }
}
