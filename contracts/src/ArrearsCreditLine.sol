// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArrearsTypes} from "./interfaces/ArrearsTypes.sol";
import {IArrearsCreditLine} from "./interfaces/IArrearsCreditLine.sol";

/**
 * @title ArrearsCreditLine
 * @notice Reprices an operator's credit line when a failure is proven against them.
 * @dev The pricing rule is a `pure` function of proven history, exposed as `quote` so an
 *      operator, a lender or a judge can check that the number the contract applied is the
 *      number the rule produces. A pricing rule nobody can independently evaluate is an oracle.
 */
contract ArrearsCreditLine is IArrearsCreditLine {
    /// @notice Each strike cuts the limit by this many basis points, compounding.
    uint16 public constant LIMIT_CUT_BPS = 2500; // 25% per strike
    /// @notice Each strike adds this to the premium.
    uint16 public constant PREMIUM_STEP_BPS = 150; // 1.5% per strike
    uint16 public constant MAX_PREMIUM_BPS = 10_000;

    /// @inheritdoc IArrearsCreditLine
    /// @dev Zero means strikes never decay. Attestcoin's provable-history floor for Ethereum
    ///      mainnet is block 0, so an operator's record has no natural window; whether a 2018
    ///      failure should weigh like a recent one is policy, and this makes the policy explicit
    ///      rather than an accident of what happens to be cheap to prove.
    uint64 public immutable decayHalfLifeSeconds;

    address public court;
    address private immutable _deployer;

    mapping(bytes32 => ArrearsTypes.CreditTerms) private _terms;
    mapping(bytes32 => uint256) private _baseLimit;
    mapping(bytes32 => uint16) private _basePremium;
    mapping(bytes32 => uint64) private _lastFailureAt;
    mapping(bytes32 => bool) private _open;

    error NotDeployer();
    error CourtAlreadySet();

    constructor(uint64 decayHalfLifeSeconds_) {
        decayHalfLifeSeconds = decayHalfLifeSeconds_;
        _deployer = msg.sender;
    }

    function setCourt(address court_) external {
        if (msg.sender != _deployer) revert NotDeployer();
        if (court != address(0)) revert CourtAlreadySet();
        court = court_;
    }

    function openLine(bytes32 operatorId, uint256 limit, uint16 premiumBps) external {
        if (_open[operatorId]) revert LineAlreadyOpen(operatorId);
        _open[operatorId] = true;
        _baseLimit[operatorId] = limit;
        _basePremium[operatorId] = premiumBps;
        _terms[operatorId] =
            ArrearsTypes.CreditTerms({limit: limit, premiumBps: premiumBps, strikes: 0, repricedAt: uint64(block.timestamp)});
        emit LineOpened(operatorId, limit, premiumBps);
    }

    function reprice(bytes32 operatorId, bytes32 claimId, uint64 failureTimestamp)
        external
        returns (ArrearsTypes.CreditTerms memory)
    {
        if (msg.sender != court) revert NotCourt(msg.sender);
        if (!_open[operatorId]) revert LineNotOpen(operatorId);

        ArrearsTypes.CreditTerms storage t = _terms[operatorId];
        uint256 oldLimit = t.limit;
        uint16 oldPremium = t.premiumBps;

        t.strikes += 1;
        _lastFailureAt[operatorId] = failureTimestamp;

        (uint256 newLimit, uint16 newPremium) =
            quote(_baseLimit[operatorId], _basePremium[operatorId], t.strikes, 0);
        t.limit = newLimit;
        t.premiumBps = newPremium;
        t.repricedAt = uint64(block.timestamp);

        emit LineRepriced(operatorId, claimId, oldLimit, newLimit, oldPremium, newPremium, t.strikes);
        if (newLimit == 0) emit LineClosed(operatorId, t.strikes);
        return t;
    }

    /**
     * @inheritdoc IArrearsCreditLine
     * @dev Deterministic and independently checkable. Strikes cut the limit multiplicatively so
     *      the tenth failure costs less in absolute terms than the first — a line already priced
     *      for an unreliable operator should not keep falling off a cliff — while the premium
     *      rises linearly to a ceiling.
     */
    function quote(uint256 baseLimit, uint16 basePremiumBps, uint32 strikes, uint64 secondsSinceLast)
        public
        view
        returns (uint256 limit, uint16 premiumBps)
    {
        uint32 effective = strikes;
        if (decayHalfLifeSeconds != 0 && secondsSinceLast != 0 && strikes != 0) {
            uint64 halvings = secondsSinceLast / decayHalfLifeSeconds;
            if (halvings >= 32) {
                effective = 0;
            } else {
                effective = uint32(uint256(strikes) >> halvings);
            }
        }

        limit = baseLimit;
        for (uint32 i; i < effective && i < 64; i++) {
            limit = (limit * (10_000 - LIMIT_CUT_BPS)) / 10_000;
        }

        uint256 p = uint256(basePremiumBps) + uint256(effective) * PREMIUM_STEP_BPS;
        premiumBps = p > MAX_PREMIUM_BPS ? MAX_PREMIUM_BPS : uint16(p);
    }

    function terms(bytes32 operatorId) external view returns (ArrearsTypes.CreditTerms memory) {
        return _terms[operatorId];
    }

    function isOpen(bytes32 operatorId) external view returns (bool) {
        return _open[operatorId];
    }
}
