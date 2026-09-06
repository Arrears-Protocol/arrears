// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArrearsTypes} from "./interfaces/ArrearsTypes.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";

/**
 * @title ArrearsVerdict
 * @notice The classification rule, in one place.
 *
 * @dev Extracted so that `ArrearsCourt` and the public `VerdictProbe` cannot drift apart. The
 *      mainnet evidence gallery and the live Sepolia slash run THIS function, not two
 *      reimplementations of it, so "identical verification path" is true by construction rather
 *      than by assertion.
 *
 *      The rule itself is one line, and the reasoning behind it is the whole product:
 *      `receiptStatus == 0` alone is not fault, because 1.47% of Ethereum mainnet transactions
 *      revert and an operator cannot be punished for participating in DeFi. `gasUsed >= gasLimit`
 *      is fault, because the sender chose the limit and nobody can race them into choosing it
 *      badly.
 */
library ArrearsVerdict {
    /// @notice Classify from the three proven values. Pure, and the only place the rule lives.
    function classify(uint8 receiptStatus, uint64 gasUsed, uint64 gasLimit)
        internal
        pure
        returns (ArrearsTypes.Verdict)
    {
        if (receiptStatus == 1) return ArrearsTypes.Verdict.Succeeded;
        return gasUsed >= gasLimit ? ArrearsTypes.Verdict.OutOfGas : ArrearsTypes.Verdict.ExplicitRevert;
    }

    /// @notice Decode attested transaction bytes and classify them in one step.
    function classifyEncoded(bytes memory txBytes)
        internal
        pure
        returns (ArrearsTypes.Verdict verdict, uint8 receiptStatus, uint64 gasUsed, uint64 gasLimit, uint256 logCount)
    {
        EvmV1Decoder.CommonTxFields memory c = EvmV1Decoder.decodeCommonTxFields(txBytes);
        EvmV1Decoder.ReceiptFields memory r = EvmV1Decoder.decodeReceiptFields(txBytes);
        receiptStatus = r.receiptStatus;
        gasUsed = r.receiptGasUsed;
        gasLimit = c.gasLimit;
        logCount = r.receiptLogs.length;
        verdict = classify(receiptStatus, gasUsed, gasLimit);
    }
}
