// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, Vm} from "forge-std/Test.sol";
import {ArrearsRegistry} from "../src/ArrearsRegistry.sol";
import {ArrearsCourt} from "../src/ArrearsCourt.sol";
import {ArrearsCreditLine} from "../src/ArrearsCreditLine.sol";
import {ArrearsTypes} from "../src/interfaces/ArrearsTypes.sol";
import {IArrearsCourt} from "../src/interfaces/IArrearsCourt.sol";
import {IArrearsRegistry} from "../src/interfaces/IArrearsRegistry.sol";
import {IBlockProver, BlockProverLib} from "../src/IBlockProver.sol";
import {MockBlockProver, TxBuilder} from "./Harness.sol";

contract ArrearsTest is Test {
    ArrearsRegistry reg;
    ArrearsCourt court;
    ArrearsCreditLine line;
    MockBlockProver mock;

    uint64 constant CHAIN_KEY = 1; // Sepolia
    uint64 constant UNBONDING = 7 days;
    uint64 constant CHALLENGE = 30 days;
    address TREASURY;
    address constant TARGET = address(0xBEEF);
    bytes4 constant SELECTOR = bytes4(0xd0e30db0); // deposit()

    uint256 opPk = 0xA11CE;
    address opSource;
    address controller;
    address relayer;
    address judge;

    bytes32 operatorId;

    function setUp() public {
        opSource = vm.addr(opPk);
        TREASURY = makeAddr("treasury");
        controller = makeAddr("controller");
        relayer = makeAddr("relayer");
        judge = makeAddr("judge");

        mock = new MockBlockProver();
        vm.etch(BlockProverLib.PRECOMPILE, address(mock).code);
        // give the etched copy the same default state
        MockBlockProver(BlockProverLib.PRECOMPILE).setShouldVerify(true);

        reg = new ArrearsRegistry(UNBONDING, CHALLENGE, TREASURY);
        line = new ArrearsCreditLine(0);
        court = new ArrearsCourt(address(reg), address(line));
        reg.setCourt(address(court));
        line.setCourt(address(court));

        // compute the signature BEFORE pranking: _sig makes an external call, which would
        // otherwise consume the prank instead of registerOperator
        bytes memory sig = _sig(controller, opSource, CHAIN_KEY);
        vm.prank(controller);
        operatorId = reg.registerOperator(opSource, CHAIN_KEY, sig);

        vm.deal(controller, 100 ether);
        vm.prank(controller);
        reg.postBond{value: 50 ether}(operatorId);

        line.openLine(operatorId, 1_000_000 ether, 500);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _sig(address ctrl, address src, uint64 ck) internal view returns (bytes memory) {
        bytes32 digest = reg.registrationDigest(ctrl, src, ck);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(opPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _scope(address t, bytes4 sel) internal pure returns (ArrearsTypes.ScopeEntry[] memory a) {
        a = new ArrearsTypes.ScopeEntry[](1);
        a[0] = ArrearsTypes.ScopeEntry({target: t, selector: sel});
    }

    function _declare(uint64 from, uint64 to, uint256 committed, uint256 cap)
        internal returns (bytes32)
    {
        vm.prank(controller);
        return reg.declareCoverage(
            operatorId, CHAIN_KEY, from, to, committed, cap,
            uint64(block.timestamp) + CHALLENGE + 1 days, _scope(TARGET, SELECTOR)
        );
    }

    function _proof(uint64 txIndex)
        internal pure returns (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp)
    {
        mp = IBlockProver.MerkleProof({root: bytes32(uint256(txIndex)), siblings: new IBlockProver.MerkleProofEntry[](0)});
        cp = IBlockProver.ContinuityProof({lowerEndpointDigest: bytes32(0), roots: new bytes32[](0)});
    }

    function _submit(uint64 height, uint64 gasLimit, uint8 status, uint64 gasUsed, uint64 txIndex)
        internal returns (bytes32 claimId, ArrearsTypes.Verdict v, uint256 slashed)
    {
        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, gasLimit, status, gasUsed);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(txIndex);
        vm.prank(relayer);
        return court.submitClaim(operatorId, height, txb, mp, cp, judge);
    }

    // ── classification: the fault line ───────────────────────────────────────

    function test_OutOfGasIsSlashable() public {
        _declare(100, 200, 10 ether, 3 ether);
        (bytes32 id, ArrearsTypes.Verdict v, uint256 slashed) = _submit(150, 50_000, 0, 50_000, 1);
        assertEq(uint8(v), uint8(ArrearsTypes.Verdict.OutOfGas));
        assertEq(slashed, 3 ether, "slashed the per-claim cap");
        assertEq(TREASURY.balance, 3 ether);
        assertEq(court.claim(id).beneficiary, judge, "relayer submitted, judge credited");
    }

    function test_ExplicitRevertIsRecordedButNotSlashed() public {
        _declare(100, 200, 10 ether, 3 ether);
        (bytes32 id, ArrearsTypes.Verdict v, uint256 slashed) = _submit(150, 50_000, 0, 20_000, 2);
        assertEq(uint8(v), uint8(ArrearsTypes.Verdict.ExplicitRevert));
        assertEq(slashed, 0, "explicit reverts are never slashable");
        assertEq(TREASURY.balance, 0);
        // recorded, not discarded
        assertEq(court.claim(id).ruledAt, block.timestamp, "the failure is on the record");
        assertEq(uint8(court.claim(id).verdict), uint8(ArrearsTypes.Verdict.ExplicitRevert));
    }

    function test_ExplicitRevertEmitsTheNamedErrorSelector() public {
        _declare(100, 200, 10 ether, 3 ether);
        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, 50_000, 0, 20_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(3);
        vm.recordLogs();
        vm.prank(relayer);
        court.submitClaim(operatorId, 150, txb, mp, cp, judge);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("SlashRefused(bytes32,bytes32,bytes4,uint64,uint64)")) {
                (bytes4 reason,,) = abi.decode(logs[i].data, (bytes4, uint64, uint64));
                assertEq(reason, IArrearsCourt.NotSlashableExplicitRevert.selector,
                    "refusal carries the named error's selector");
                found = true;
            }
        }
        assertTrue(found, "SlashRefused was emitted");
    }

    function test_StrictPathRevertsWithTheNamedError() public {
        _declare(100, 200, 10 ether, 3 ether);
        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, 50_000, 0, 20_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(4);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IArrearsCourt.NotSlashableExplicitRevert.selector, uint64(20_000), uint64(50_000)));
        court.submitSlashingClaim(operatorId, 150, txb, mp, cp, judge);
    }

    function test_SuccessfulTransactionIsRefused() public {
        _declare(100, 200, 10 ether, 3 ether);
        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, 50_000, 1, 30_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(5);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IArrearsCourt.SourceTransactionSucceeded.selector, uint8(1)));
        court.submitClaim(operatorId, 150, txb, mp, cp, judge);
    }

    // ── REVOCATION BOUNDARY: the block before, and the block after ───────────

    function test_RevocationBoundary_ClaimTheBlockBefore_STILL_COVERED() public {
        bytes32 cov = _declare(100, 200, 10 ether, 3 ether);
        vm.prank(controller);
        reg.revokeCoverage(cov, 150); // revoked from height 150

        (, ArrearsTypes.Verdict v, uint256 slashed) = _submit(149, 50_000, 0, 50_000, 10);
        assertEq(uint8(v), uint8(ArrearsTypes.Verdict.OutOfGas));
        assertEq(slashed, 3 ether, "a failure one block BEFORE revocation is still liable");
    }

    function test_RevocationBoundary_AtTheRevocationHeight_STILL_COVERED() public {
        bytes32 cov = _declare(100, 200, 10 ether, 3 ether);
        vm.prank(controller);
        reg.revokeCoverage(cov, 150);
        (, , uint256 slashed) = _submit(150, 50_000, 0, 50_000, 11);
        assertEq(slashed, 3 ether, "revokedAtHeight itself is inclusive");
    }

    function test_RevocationBoundary_ClaimTheBlockAfter_NOT_COVERED() public {
        bytes32 cov = _declare(100, 200, 10 ether, 3 ether);
        vm.prank(controller);
        reg.revokeCoverage(cov, 150);

        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, 50_000, 0, 50_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(12);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(
            IArrearsCourt.OutOfScope.selector, ArrearsTypes.ScopeMiss.Revoked, TARGET, SELECTOR, uint64(151)));
        court.submitClaim(operatorId, 151, txb, mp, cp, judge);
        assertEq(TREASURY.balance, 0, "nothing slashed one block after revocation");
    }

    function test_RevocationCannotOutrunAPendingClaim() public {
        bytes32 cov = _declare(100, 200, 10 ether, 3 ether);
        // operator sees bad news and revokes from the earliest point they can
        vm.prank(controller);
        reg.revokeCoverage(cov, 0); // clamped up to fromHeight = 100
        assertEq(reg.coverage(cov).revokedAtHeight, 100, "revocation clamps into the window, never before it");
        (, , uint256 slashed) = _submit(100, 50_000, 0, 50_000, 13);
        assertEq(slashed, 3 ether, "the first covered block stays liable");
    }

    // ── COVERAGE SELECTION at the boundary ───────────────────────────────────

    function test_Selection_PicksWidestPayable_NotTheWeakOne() public {
        bytes32 weak = _declare(100, 200, 10 ether, 1 wei);   // declared FIRST, tiny cap
        bytes32 strong = _declare(100, 200, 10 ether, 5 ether); // declared SECOND, real cap
        assertEq(court.selectCoverage(operatorId, 150, TARGET, SELECTOR), strong,
            "the court takes the widest payable, not the earliest or the submitter's choice");
        (, , uint256 slashed) = _submit(150, 50_000, 0, 50_000, 20);
        assertEq(slashed, 5 ether, "the griefing path is closed: a weak coverage cannot cap the slash");
        assertGt(uint256(uint160(uint256(weak))) , 0); // silence unused
    }

    function test_Selection_LiabilityIsMonotonic_AddingCoverageNeverReduces() public {
        _declare(100, 200, 10 ether, 5 ether);
        uint256 before_ = reg.payable_(court.selectCoverage(operatorId, 150, TARGET, SELECTOR));
        _declare(100, 200, 10 ether, 1 wei); // add a token coverage afterwards
        uint256 after_ = reg.payable_(court.selectCoverage(operatorId, 150, TARGET, SELECTOR));
        assertGe(after_, before_, "declaring more coverage can never reduce exposure");
        assertEq(after_, 5 ether);
    }

    function test_Selection_TieBreaksToEarliestDeclared() public {
        bytes32 first = _declare(100, 200, 10 ether, 4 ether);
        _declare(100, 200, 10 ether, 4 ether); // identical payable
        assertEq(court.selectCoverage(operatorId, 150, TARGET, SELECTOR), first,
            "equal payable breaks to the earliest declared");
    }

    function test_Selection_UsesPayableNotNominalCap() public {
        // A promises a huge cap over a nearly exhausted commitment; B promises less but can pay it.
        bytes32 a = _declare(100, 200, 1 ether, 100 ether);
        bytes32 b = _declare(100, 200, 10 ether, 2 ether);
        assertEq(reg.payable_(a), 1 ether, "A can only ever pay its commitment");
        assertEq(reg.payable_(b), 2 ether);
        assertEq(court.selectCoverage(operatorId, 150, TARGET, SELECTOR), b,
            "selection compares what would actually be paid, not what is nominally promised");
    }

    function test_Selection_WindowBoundariesAreInclusive() public {
        bytes32 cov = _declare(100, 200, 10 ether, 3 ether);
        assertEq(court.selectCoverage(operatorId, 100, TARGET, SELECTOR), cov, "fromHeight inclusive");
        assertEq(court.selectCoverage(operatorId, 200, TARGET, SELECTOR), cov, "toHeight inclusive");
        assertEq(court.selectCoverage(operatorId, 99, TARGET, SELECTOR), bytes32(0), "one below is outside");
        assertEq(court.selectCoverage(operatorId, 201, TARGET, SELECTOR), bytes32(0), "one above is outside");
    }

    function test_Selection_IgnoresCoverageThatCanPayNothing() public {
        bytes32 drained = _declare(100, 200, 3 ether, 3 ether);
        _submit(150, 50_000, 0, 50_000, 30); // drains it
        assertEq(reg.payable_(drained), 0);
        assertEq(court.selectCoverage(operatorId, 160, TARGET, SELECTOR), bytes32(0),
            "an exhausted coverage is not selected, so it cannot burn a claim id for a zero slash");
    }

    // ── scope refusals ───────────────────────────────────────────────────────

    function test_OutOfScope_WrongSelector() public {
        _declare(100, 200, 10 ether, 3 ether);
        bytes memory txb = TxBuilder.encode(opSource, TARGET, bytes4(0xdeadbeef), 50_000, 0, 50_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(40);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(
            IArrearsCourt.OutOfScope.selector, ArrearsTypes.ScopeMiss.Selector, TARGET, bytes4(0xdeadbeef), uint64(150)));
        court.submitClaim(operatorId, 150, txb, mp, cp, judge);
    }

    function test_OutOfScope_WrongOperator() public {
        _declare(100, 200, 10 ether, 3 ether);
        bytes memory txb = TxBuilder.encode(address(0xDEAD), TARGET, SELECTOR, 50_000, 0, 50_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(41);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IArrearsCourt.WrongOperator.selector, address(0xDEAD), opSource));
        court.submitClaim(operatorId, 150, txb, mp, cp, judge);
    }

    function test_OutOfScope_WindowMissReportsWindow() public {
        _declare(100, 200, 10 ether, 3 ether);
        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, 50_000, 0, 50_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(42);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(
            IArrearsCourt.OutOfScope.selector, ArrearsTypes.ScopeMiss.Window, TARGET, SELECTOR, uint64(500)));
        court.submitClaim(operatorId, 500, txb, mp, cp, judge);
    }

    function test_OutOfScope_UncoveredContractReportsTarget() public {
        _declare(100, 200, 10 ether, 3 ether);
        address other = address(0xFEED);
        bytes memory txb = TxBuilder.encode(opSource, other, SELECTOR, 50_000, 0, 50_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(43);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(
            IArrearsCourt.OutOfScope.selector, ArrearsTypes.ScopeMiss.Target, other, SELECTOR, uint64(150)));
        court.submitClaim(operatorId, 150, txb, mp, cp, judge);
    }

    function test_OutOfScope_AfterClaimDeadlineReportsExpired() public {
        _declare(100, 200, 10 ether, 3 ether);
        vm.warp(block.timestamp + CHALLENGE + 2 days); // past claimDeadline
        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, 50_000, 0, 50_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(44);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(
            IArrearsCourt.OutOfScope.selector, ArrearsTypes.ScopeMiss.Expired, TARGET, SELECTOR, uint64(150)));
        court.submitClaim(operatorId, 150, txb, mp, cp, judge);
    }

    function test_OutOfScope_DrainedCoverageReportsExhausted() public {
        _declare(100, 200, 3 ether, 3 ether);
        _submit(150, 50_000, 0, 50_000, 45); // drains it
        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, 50_000, 0, 50_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(46);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(
            IArrearsCourt.OutOfScope.selector, ArrearsTypes.ScopeMiss.Exhausted, TARGET, SELECTOR, uint64(160)));
        court.submitClaim(operatorId, 160, txb, mp, cp, judge);
    }

    // ── release ──────────────────────────────────────────────────────────────

    function test_ReleaseReturnsUnusedCommitmentAfterDeadline() public {
        bytes32 cov = _declare(100, 200, 20 ether, 3 ether);
        assertEq(reg.freeBond(operatorId), 30 ether);
        vm.warp(block.timestamp + CHALLENGE + 2 days);
        reg.releaseCoverage(cov);
        assertEq(reg.freeBond(operatorId), 50 ether, "untouched commitment returns to free bond");
    }

    function test_ReleaseBeforeDeadlineIsRefused() public {
        bytes32 cov = _declare(100, 200, 20 ether, 3 ether);
        vm.expectRevert();
        reg.releaseCoverage(cov);
    }

    // ── preview: the free dry run sponsorship depends on ─────────────────────

    function test_PreviewMatchesTheRulingWithoutSpending() public {
        _declare(100, 200, 10 ether, 3 ether);
        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, 50_000, 0, 50_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(47);
        (bool ok, ArrearsTypes.Verdict v, ArrearsTypes.ScopeMiss miss, bytes32 sel, uint256 would) =
            court.previewClaim(operatorId, 150, txb, mp, cp);
        assertTrue(ok);
        assertEq(uint8(v), uint8(ArrearsTypes.Verdict.OutOfGas));
        assertEq(uint8(miss), uint8(ArrearsTypes.ScopeMiss.None));
        assertEq(would, 3 ether);
        assertEq(TREASURY.balance, 0, "preview spent nothing");
        (, , uint256 actual) = _submit(150, 50_000, 0, 50_000, 47);
        assertEq(actual, would, "preview predicted the ruling exactly");
        assertEq(court.claim(court.claimIdOf(CHAIN_KEY, 150, 47)).coverageId, sel);
    }

    // ── replay ───────────────────────────────────────────────────────────────

    function test_ReplayIsRefusedCheaply() public {
        _declare(100, 200, 20 ether, 3 ether);
        (bytes32 id,,) = _submit(150, 50_000, 0, 50_000, 50);
        bytes memory txb = TxBuilder.encode(opSource, TARGET, SELECTOR, 50_000, 0, 50_000);
        (IBlockProver.MerkleProof memory mp, IBlockProver.ContinuityProof memory cp) = _proof(50);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IArrearsCourt.AlreadyClaimed.selector, id));
        court.submitClaim(operatorId, 150, txb, mp, cp, judge);
    }

    // ── bond mechanics ───────────────────────────────────────────────────────

    function test_CommittedBondCannotBeWithdrawn() public {
        _declare(100, 200, 40 ether, 3 ether);
        assertEq(reg.freeBond(operatorId), 10 ether);
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(IArrearsRegistry.InsufficientFreeBond.selector, 20 ether, 10 ether));
        reg.requestWithdrawal(operatorId, 20 ether);
    }

    function test_WithdrawalRespectsUnbondingPeriod() public {
        vm.prank(controller);
        reg.requestWithdrawal(operatorId, 10 ether);
        vm.prank(controller);
        vm.expectRevert();
        reg.withdrawBond(operatorId, payable(controller));
        vm.warp(block.timestamp + UNBONDING + 1);
        vm.prank(controller);
        reg.withdrawBond(operatorId, payable(controller));
        assertEq(reg.operator(operatorId).bonded, 0);
    }

    // ── identity binding ─────────────────────────────────────────────────────

    function test_RegistrationRequiresProofOfControl() public {
        address other = vm.addr(0xB0B);
        // a signature by opPk cannot register `other`, whose key we do not hold
        bytes memory sig = _sig(controller, other, CHAIN_KEY);
        vm.prank(controller);
        vm.expectRevert();
        reg.registerOperator(other, CHAIN_KEY, sig);
    }

    function test_SignatureIsBoundToTheController() public {
        // a signature made for one controller must not register under another
        bytes memory sig = _sig(controller, opSource, CHAIN_KEY);
        address attacker = address(0xBAD);
        vm.prank(attacker);
        vm.expectRevert();
        reg.registerOperator(opSource, CHAIN_KEY, sig);
    }

    // ── credit line ──────────────────────────────────────────────────────────

    function test_SlashRepricesTheLineAtomically() public {
        _declare(100, 200, 20 ether, 3 ether);
        (uint256 l0,) = line.quote(1_000_000 ether, 500, 0, 0);
        _submit(150, 50_000, 0, 50_000, 60);
        ArrearsTypes.CreditTerms memory t = line.terms(operatorId);
        assertEq(t.strikes, 1);
        (uint256 l1, uint16 p1) = line.quote(1_000_000 ether, 500, 1, 0);
        assertEq(t.limit, l1, "the applied limit is exactly what the public rule produces");
        assertEq(t.premiumBps, p1);
        assertLt(t.limit, l0, "a proven failure reduces the line");
    }

    function test_QuoteIsIndependentlyCheckable() public view {
        (uint256 l1,) = line.quote(1000 ether, 500, 1, 0);
        (uint256 l2,) = line.quote(1000 ether, 500, 2, 0);
        assertEq(l1, 750 ether, "one strike cuts 25%");
        assertEq(l2, 562.5 ether, "strikes compound multiplicatively");
    }
}
