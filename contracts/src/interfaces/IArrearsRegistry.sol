// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ArrearsTypes} from "./ArrearsTypes.sol";

/**
 * @title IArrearsRegistry
 * @notice Who is bonded, for what, and over which blocks.
 *
 * @dev The registry solves a problem the court cannot: the bond is posted on Creditcoin by a
 *      Creditcoin account, but every piece of evidence Arrears will ever see names an *Ethereum*
 *      address in the proven `commonTx.from`. Nothing in the Attestcoin proof binds those two
 *      identities. If the binding is wrong, Arrears slashes the wrong party, so it is
 *      established once, up front, and proven rather than asserted.
 */
interface IArrearsRegistry {
    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event OperatorRegistered(
        bytes32 indexed operatorId, address indexed controller, address indexed sourceAddress, uint64 chainKey
    );
    event BondPosted(bytes32 indexed operatorId, uint256 amount, uint256 total);
    event WithdrawalRequested(bytes32 indexed operatorId, uint256 amount, uint64 withdrawableAt);
    event BondWithdrawn(bytes32 indexed operatorId, address indexed to, uint256 amount);
    event CoverageDeclared(
        bytes32 indexed coverageId,
        bytes32 indexed operatorId,
        uint64 chainKey,
        uint64 fromHeight,
        uint64 toHeight,
        uint256 committed,
        uint64 claimDeadline
    );
    event CoverageScopeAdded(bytes32 indexed coverageId, address indexed target, bytes4 indexed selector);
    event CoverageRevoked(bytes32 indexed coverageId, uint64 at);
    event CoverageReleased(bytes32 indexed coverageId, uint256 returned);
    event BondSlashedFrom(bytes32 indexed operatorId, bytes32 indexed coverageId, uint256 amount, uint256 remaining);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 operatorId);
    error NotRegistered(bytes32 operatorId);
    error NotController(address caller, address controller);
    /// @notice The signature did not recover to the source address being claimed.
    error ControlNotProven(address recovered, address claimed);
    error InsufficientFreeBond(uint256 requested, uint256 free);
    /// @notice A withdrawal was attempted before its unbonding period elapsed.
    error BondStillLocked(uint64 withdrawableAt, uint64 nowTs);
    /// @notice Coverage whose claim deadline is not strictly after its window would let an
    ///         operator close cover faster than evidence can surface.
    error ClaimDeadlineTooEarly(uint64 given, uint64 minimum);
    error EmptyScope();
    error WindowInverted(uint64 fromHeight, uint64 toHeight);
    /// @notice Coverage may only name the chain the operator registered on.
    error ChainKeyMismatch(uint64 coverageChainKey, uint64 operatorChainKey);
    error CoverageAlreadyRevoked(bytes32 coverageId);
    error CoverageAlreadyReleased(bytes32 coverageId);

    // ─────────────────────────────────────────────────────────────────────────
    // Identity
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Bind a Creditcoin controller to the source-chain address whose failures its bond
     *         will answer for.
     * @dev Control is proven, not asserted. `proofOfControl` is an EIP-191 signature by the
     *      source-chain key over `registrationDigest(controller, sourceAddress, chainKey)`; the
     *      registry recovers it and reverts `ControlNotProven` on mismatch. This keeps the whole
     *      binding on Creditcoin and costs one `ecrecover`.
     *
     *      An alternative was considered and rejected for now: have the operator send a marker
     *      transaction on Ethereum and prove it through Attestcoin itself. That is more elegant
     *      and needs no signature scheme, but it costs the operator real mainnet gas and a
     *      round-trip through attestation before they can even register. Worth revisiting if the
     *      signature route proves awkward for smart-contract operators, which cannot sign.
     *
     * @param sourceAddress The address on the source chain, matched against proven `commonTx.from`.
     * @param chainKey      Attestcoin source-chain key. 3 = Ethereum mainnet, 1 = Sepolia.
     * @param proofOfControl EIP-191 signature by `sourceAddress` over the registration digest.
     * @return operatorId    keccak256(chainKey, sourceAddress).
     */
    function registerOperator(address sourceAddress, uint64 chainKey, bytes calldata proofOfControl)
        external
        returns (bytes32 operatorId);

    /// @notice The digest a source-chain key must sign to prove control. Exposed so an operator
    ///         can produce the signature entirely off chain before their first transaction.
    function registrationDigest(address controller, address sourceAddress, uint64 chainKey)
        external
        view
        returns (bytes32);

    // ─────────────────────────────────────────────────────────────────────────
    // Bond
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Add CTC to an operator's bond. Permissionless: anyone may bond on an operator's
    ///         behalf, since over-collateralising someone else harms nobody.
    function postBond(bytes32 operatorId) external payable;

    /**
     * @notice Begin unbonding. Starts a timer rather than paying out.
     * @dev The delay exists because evidence is historical. A failure can be proven long after
     *      it happened -- Arrears has verified mainnet transactions from March 2023 against the
     *      live precompile -- so an operator who could withdraw instantly on seeing bad news
     *      would never be slashable. Only bond free of live coverage may be requested.
     */
    function requestWithdrawal(bytes32 operatorId, uint256 amount) external;

    /// @notice Complete a withdrawal whose unbonding period has elapsed.
    function withdrawBond(bytes32 operatorId, address payable to) external;

    // ─────────────────────────────────────────────────────────────────────────
    // Coverage
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Declare a scoped promise: these contracts, these selectors, these blocks.
     * @dev Scope is the whole design. The bond answers for failures inside it and refuses
     *      everything else with `IArrearsCourt.OutOfScope`, which names the axis that missed.
     *
     *      `toHeight` may be set beyond the current source-chain tip to cover future blocks, and
     *      may also be set entirely in the past: because Attestcoin's provable-history floor for
     *      Ethereum mainnet is block 0, an operator can bond retroactively against a window that
     *      has already closed. Proving old blocks costs more -- continuity proofs lengthen as
     *      checkpoints thin out, measured at roughly 3-6x -- but the worst case measured was
     *      0.632% of a CC3 block, so nothing here needs a recency restriction.
     *
     * @param committed    Bond earmarked for this coverage; must be free bond.
     * @param perClaimCap  Ceiling on a single slash, so one bad hour cannot zero a bond.
     * @param claimDeadline CC3 timestamp after which no new claim may be filed. Must exceed
     *                      `toHeight`'s expected real-world time by at least the challenge period.
     * @param scope        The (contract, selector) pairs covered. Must be non-empty.
     */
    function declareCoverage(
        bytes32 operatorId,
        uint64 chainKey,
        uint64 fromHeight,
        uint64 toHeight,
        uint256 committed,
        uint256 perClaimCap,
        uint64 claimDeadline,
        ArrearsTypes.ScopeEntry[] calldata scope
    ) external returns (bytes32 coverageId);

    /**
     * @notice Stop new coverage accruing. Does NOT extinguish liability for failures that
     *         already happened inside the window -- those stay claimable until `claimDeadline`.
     * @dev Deliberate. An operator who could revoke their way out of a pending claim would make
     *      the bond decorative.
     */
    function revokeCoverage(bytes32 coverageId) external;

    /// @notice Revoke from an explicit source-chain height. See the implementation for why
    ///         revocation is a height boundary and not a timestamp one.
    function revokeCoverage(bytes32 coverageId, uint64 atHeight) external;

    /// @notice After `claimDeadline`, return a coverage's untouched commitment to free bond.
    function releaseCoverage(bytes32 coverageId) external;

    /// @notice Whether a coverage admits a failure at `height` on all four scope axes.
    function admits(bytes32 coverageId, uint64 chainKey, uint64 height, address target, bytes4 selector)
        external view returns (bool);

    /// @notice What a coverage would actually pay for one claim right now:
    ///         `min(perClaimCap, committed - drawn)`.
    function payable_(bytes32 coverageId) external view returns (uint256);

    /// @notice Coverages of an operator, in declaration order. An append-only array, so the
    ///         court's selection rule iterates a sequence fixed by history.
    function coveragesOf(bytes32 operatorId) external view returns (bytes32[] memory);

    /// @notice Take `amount` from a coverage, capped at `payable_`. Court only.
    function slash(bytes32 operatorId, bytes32 coverageId, uint256 amount) external returns (uint256);

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function operator(bytes32 operatorId) external view returns (ArrearsTypes.Operator memory);
    function coverage(bytes32 coverageId) external view returns (ArrearsTypes.Coverage memory);
    function coverageScope(bytes32 coverageId) external view returns (ArrearsTypes.ScopeEntry[] memory);

    /// @notice Whether a (target, selector) pair is inside a coverage's declared scope.
    function inScope(bytes32 coverageId, address target, bytes4 selector) external view returns (bool);

    /// @notice Whether a coverage names this contract under any selector at all.
    function coversTarget(bytes32 coverageId, address target) external view returns (bool);

    /// @notice Bond not earmarked by live coverage, and therefore requestable for withdrawal.
    function freeBond(bytes32 operatorId) external view returns (uint256);

    function operatorIdOf(uint64 chainKey, address sourceAddress) external pure returns (bytes32);
}
