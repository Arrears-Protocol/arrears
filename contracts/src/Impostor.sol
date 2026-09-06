// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Impostor
 * @notice Deployed on Ethereum Sepolia. Holds no balance, tracks no state, implements no token.
 *         It emits one event: the standard ERC-20 Transfer signature, with whatever arguments
 *         the caller names.
 *
 * Nothing here is an exploit of Attestcoin. Attestcoin proves, correctly, that this
 * transaction happened and that this log was emitted. The point is what a consuming
 * contract on Creditcoin infers from that proof if it matches on the event signature and
 * never checks which contract emitted it.
 */
contract Impostor {
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice Emit an ERC-20 Transfer log claiming any sender, recipient and amount.
    function forge(address from, address to, uint256 value) external {
        emit Transfer(from, to, value);
    }
}
