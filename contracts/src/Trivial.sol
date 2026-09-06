// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Trivial
/// @notice The smallest useful contract, for measuring what deployment costs on CC3.
contract Trivial {
    uint256 public value;
    event Set(uint256 value);
    function set(uint256 v) external { value = v; emit Set(v); }
}
