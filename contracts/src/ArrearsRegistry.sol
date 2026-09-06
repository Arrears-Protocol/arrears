// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArrearsTypes} from "./interfaces/ArrearsTypes.sol";
import {IArrearsRegistry} from "./interfaces/IArrearsRegistry.sol";

/**
 * @title ArrearsRegistry
 * @notice Who is bonded, for what, and over which blocks.
 * @dev Holds every bond. The court is the only address permitted to move money out, and only by
 *      slashing against a coverage the court itself selected.
 */
contract ArrearsRegistry is IArrearsRegistry {
    /// @notice How long a withdrawal request must wait before it can complete.
    /// @dev Evidence is historical: Arrears has verified mainnet failures from 2023 against the
    ///      live precompile. An operator who could withdraw the instant bad news appeared would
    ///      never be slashable, so the bond has to outlive the operator's knowledge of it.
    uint64 public immutable unbondingPeriod;

    /// @notice Minimum gap between a coverage's window closing and its claim deadline.
    uint64 public immutable minChallengePeriod;

    /// @notice Where slashed bond goes. Set once, at deployment.
    address public immutable treasury;

    address public court;
    address private immutable _deployer;

    mapping(bytes32 => ArrearsTypes.Operator) private _operators;
    mapping(bytes32 => bool) private _registered;
    mapping(bytes32 => ArrearsTypes.Coverage) private _coverages;
    mapping(bytes32 => ArrearsTypes.ScopeEntry[]) private _scopeList;
    mapping(bytes32 => mapping(bytes32 => bool)) private _inScope;
    /// @dev coverageId => target => covered by at least one selector. Lets the court tell
    ///      "this contract is not covered" apart from "this selector on it is not".
    mapping(bytes32 => mapping(address => bool)) private _coversTarget;

    /// @dev Append-only, in declaration order. An ARRAY, never a mapping: the court's coverage
    ///      selection iterates this, and iteration order must be fixed by history rather than by
    ///      storage layout or anything a caller can perturb.
    mapping(bytes32 => bytes32[]) private _coveragesOf;

    uint64 private _seq;

    error NotDeployer();
    error CourtAlreadySet();
    error ZeroAddress();

    modifier onlyCourt() {
        if (msg.sender != court) revert NotController(msg.sender, court);
        _;
    }

    constructor(uint64 unbondingPeriod_, uint64 minChallengePeriod_, address treasury_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        unbondingPeriod = unbondingPeriod_;
        minChallengePeriod = minChallengePeriod_;
        treasury = treasury_;
        _deployer = msg.sender;
    }

    /// @notice Wire the court once. Immutable thereafter.
    function setCourt(address court_) external {
        if (msg.sender != _deployer) revert NotDeployer();
        if (court != address(0)) revert CourtAlreadySet();
        if (court_ == address(0)) revert ZeroAddress();
        court = court_;
    }

    // ── identity ─────────────────────────────────────────────────────────────

    function operatorIdOf(uint64 chainKey, address sourceAddress) public pure returns (bytes32) {
        return keccak256(abi.encode(chainKey, sourceAddress));
    }

    function registrationDigest(address controller, address sourceAddress, uint64 chainKey)
        public
        view
        returns (bytes32)
    {
        bytes32 inner = keccak256(
            abi.encode("Arrears:registerOperator:v1", block.chainid, address(this), controller, sourceAddress, chainKey)
        );
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
    }

    function registerOperator(address sourceAddress, uint64 chainKey, bytes calldata proofOfControl)
        external
        returns (bytes32 operatorId)
    {
        if (sourceAddress == address(0)) revert ZeroAddress();
        operatorId = operatorIdOf(chainKey, sourceAddress);
        if (_registered[operatorId]) revert AlreadyRegistered(operatorId);

        address recovered = _recover(registrationDigest(msg.sender, sourceAddress, chainKey), proofOfControl);
        if (recovered != sourceAddress) revert ControlNotProven(recovered, sourceAddress);

        _registered[operatorId] = true;
        ArrearsTypes.Operator storage o = _operators[operatorId];
        o.controller = msg.sender;
        o.sourceAddress = sourceAddress;
        o.chainKey = chainKey;

        emit OperatorRegistered(operatorId, msg.sender, sourceAddress, chainKey);
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        // reject the malleable upper half of the curve order
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s);
    }

    // ── bond ─────────────────────────────────────────────────────────────────

    function postBond(bytes32 operatorId) external payable {
        if (!_registered[operatorId]) revert NotRegistered(operatorId);
        ArrearsTypes.Operator storage o = _operators[operatorId];
        o.bonded += msg.value;
        emit BondPosted(operatorId, msg.value, o.bonded);
    }

    function freeBond(bytes32 operatorId) public view returns (uint256) {
        ArrearsTypes.Operator storage o = _operators[operatorId];
        return o.bonded > o.committed ? o.bonded - o.committed : 0;
    }

    function requestWithdrawal(bytes32 operatorId, uint256 amount) external {
        ArrearsTypes.Operator storage o = _operators[operatorId];
        if (!_registered[operatorId]) revert NotRegistered(operatorId);
        if (msg.sender != o.controller) revert NotController(msg.sender, o.controller);
        uint256 free = freeBond(operatorId);
        if (amount > free) revert InsufficientFreeBond(amount, free);
        o.withdrawableAt = uint64(block.timestamp) + unbondingPeriod;
        emit WithdrawalRequested(operatorId, amount, o.withdrawableAt);
    }

    function withdrawBond(bytes32 operatorId, address payable to) external {
        ArrearsTypes.Operator storage o = _operators[operatorId];
        if (msg.sender != o.controller) revert NotController(msg.sender, o.controller);
        if (o.withdrawableAt == 0 || block.timestamp < o.withdrawableAt) {
            revert BondStillLocked(o.withdrawableAt, uint64(block.timestamp));
        }
        uint256 amount = freeBond(operatorId);
        if (amount == 0) revert InsufficientFreeBond(0, 0);
        o.bonded -= amount;
        o.withdrawableAt = 0;
        emit BondWithdrawn(operatorId, to, amount);
        (bool ok,) = to.call{value: amount}("");
        require(ok, "transfer failed");
    }

    // ── coverage ─────────────────────────────────────────────────────────────

    function declareCoverage(
        bytes32 operatorId,
        uint64 chainKey,
        uint64 fromHeight,
        uint64 toHeight,
        uint256 committed,
        uint256 perClaimCap,
        uint64 claimDeadline,
        ArrearsTypes.ScopeEntry[] calldata scope
    ) external returns (bytes32 coverageId) {
        ArrearsTypes.Operator storage o = _operators[operatorId];
        if (!_registered[operatorId]) revert NotRegistered(operatorId);
        if (msg.sender != o.controller) revert NotController(msg.sender, o.controller);
        if (chainKey != o.chainKey) revert ChainKeyMismatch(chainKey, o.chainKey);
        if (toHeight < fromHeight) revert WindowInverted(fromHeight, toHeight);
        if (scope.length == 0) revert EmptyScope();
        uint64 minDeadline = uint64(block.timestamp) + minChallengePeriod;
        if (claimDeadline < minDeadline) revert ClaimDeadlineTooEarly(claimDeadline, minDeadline);
        uint256 free = freeBond(operatorId);
        if (committed > free) revert InsufficientFreeBond(committed, free);

        uint64 seq = ++_seq;
        coverageId = keccak256(abi.encode(operatorId, seq));

        ArrearsTypes.Coverage storage c = _coverages[coverageId];
        c.operatorId = operatorId;
        c.chainKey = chainKey;
        c.fromHeight = fromHeight;
        c.toHeight = toHeight;
        c.committed = committed;
        c.perClaimCap = perClaimCap;
        c.claimDeadline = claimDeadline;
        c.active = true;
        c.seq = seq;

        o.committed += committed;
        _coveragesOf[operatorId].push(coverageId);

        for (uint256 i; i < scope.length; i++) {
            bytes32 k = _scopeKey(scope[i].target, scope[i].selector);
            if (!_inScope[coverageId][k]) {
                _inScope[coverageId][k] = true;
                _coversTarget[coverageId][scope[i].target] = true;
                _scopeList[coverageId].push(scope[i]);
                emit CoverageScopeAdded(coverageId, scope[i].target, scope[i].selector);
            }
        }

        emit CoverageDeclared(coverageId, operatorId, chainKey, fromHeight, toHeight, committed, claimDeadline);
    }

    /**
     * @notice Stop new coverage accruing.
     * @dev Records the source-chain height at which revocation took effect and leaves the
     *      coverage claimable for failures at or below it until `claimDeadline`. An operator who
     *      could revoke their way out of a pending claim would make the bond decorative, so
     *      revocation narrows the window and never closes the door.
     * @param atHeight Source-chain height revocation takes effect from. Clamped into the
     *                 coverage's own window so revocation can neither widen it nor rewrite history.
     */
    function revokeCoverage(bytes32 coverageId, uint64 atHeight) public {
        ArrearsTypes.Coverage storage c = _coverages[coverageId];
        ArrearsTypes.Operator storage o = _operators[c.operatorId];
        if (msg.sender != o.controller) revert NotController(msg.sender, o.controller);
        if (!c.active) revert CoverageAlreadyRevoked(coverageId);
        if (atHeight < c.fromHeight) atHeight = c.fromHeight;
        if (atHeight > c.toHeight) atHeight = c.toHeight;
        c.active = false;
        c.revokedAtHeight = atHeight;
        emit CoverageRevoked(coverageId, uint64(block.timestamp));
    }

    /// @notice Convenience overload: revoke from the coverage's declared end.
    function revokeCoverage(bytes32 coverageId) external {
        revokeCoverage(coverageId, _coverages[coverageId].toHeight);
    }

    /// @notice After the claim deadline, return the untouched commitment to free bond.
    function releaseCoverage(bytes32 coverageId) external {
        ArrearsTypes.Coverage storage c = _coverages[coverageId];
        if (c.operatorId == bytes32(0)) revert NotRegistered(coverageId);
        if (block.timestamp < c.claimDeadline) revert ClaimDeadlineTooEarly(uint64(block.timestamp), c.claimDeadline);
        if (c.released) revert CoverageAlreadyReleased(coverageId);
        c.released = true;
        uint256 left = c.committed - c.drawn;
        _operators[c.operatorId].committed -= left;
        emit CoverageReleased(coverageId, left);
    }

    /**
     * @notice Whether a coverage admits a failure at `height`. Court-facing.
     * @dev Revocation is a HEIGHT boundary, not a timestamp one: a failure at or below
     *      `revokedAtHeight` is still covered, one above it is not. `claimDeadline` is a separate,
     *      wall-clock bound on when the claim may be FILED.
     */
    function admits(bytes32 coverageId, uint64 chainKey, uint64 height, address target, bytes4 selector)
        public
        view
        returns (bool)
    {
        ArrearsTypes.Coverage storage c = _coverages[coverageId];
        if (c.operatorId == bytes32(0)) return false;
        if (c.chainKey != chainKey) return false;
        if (height < c.fromHeight || height > c.toHeight) return false;
        if (!c.active && height > c.revokedAtHeight) return false;
        if (block.timestamp > c.claimDeadline) return false;
        return _inScope[coverageId][_scopeKey(target, selector)];
    }

    /// @notice What a coverage would actually pay for one claim right now.
    function payable_(bytes32 coverageId) public view returns (uint256) {
        ArrearsTypes.Coverage storage c = _coverages[coverageId];
        uint256 left = c.committed > c.drawn ? c.committed - c.drawn : 0;
        return c.perClaimCap < left ? c.perClaimCap : left;
    }

    // ── slashing, court only ─────────────────────────────────────────────────

    function slash(bytes32 operatorId, bytes32 coverageId, uint256 amount) external onlyCourt returns (uint256) {
        ArrearsTypes.Coverage storage c = _coverages[coverageId];
        ArrearsTypes.Operator storage o = _operators[operatorId];
        uint256 cap = payable_(coverageId);
        if (amount > cap) amount = cap;
        if (amount == 0) return 0;

        c.drawn += amount;
        o.bonded -= amount;
        o.committed -= amount;
        o.slashed += amount;

        emit BondSlashedFrom(operatorId, coverageId, amount, o.bonded);
        (bool ok,) = payable(treasury).call{value: amount}("");
        require(ok, "treasury transfer failed");
        return amount;
    }

    // ── views ────────────────────────────────────────────────────────────────

    function operator(bytes32 operatorId) external view returns (ArrearsTypes.Operator memory) {
        return _operators[operatorId];
    }

    function coverage(bytes32 coverageId) external view returns (ArrearsTypes.Coverage memory) {
        return _coverages[coverageId];
    }

    function coverageScope(bytes32 coverageId) external view returns (ArrearsTypes.ScopeEntry[] memory) {
        return _scopeList[coverageId];
    }

    function coveragesOf(bytes32 operatorId) external view returns (bytes32[] memory) {
        return _coveragesOf[operatorId];
    }

    function inScope(bytes32 coverageId, address target, bytes4 selector) external view returns (bool) {
        return _inScope[coverageId][_scopeKey(target, selector)];
    }

    /// @notice Whether a coverage names this contract under any selector.
    function coversTarget(bytes32 coverageId, address target) external view returns (bool) {
        return _coversTarget[coverageId][target];
    }

    function isRegistered(bytes32 operatorId) external view returns (bool) {
        return _registered[operatorId];
    }

    function _scopeKey(address target, bytes4 selector) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(target, selector));
    }

    receive() external payable {}
}
