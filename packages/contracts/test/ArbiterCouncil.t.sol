// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { TestBase } from "./helpers/TestBase.sol";
import { MockBountyBoard } from "./helpers/MockBountyBoard.sol";
import { ArbiterCouncil } from "../src/ArbiterCouncil.sol";
import { IArbiterCouncil } from "../src/interfaces/IArbiterCouncil.sol";
import { IBountyBoard } from "../src/interfaces/IBountyBoard.sol";

contract ArbiterCouncilTest is TestBase {
    ArbiterCouncil internal council;
    MockBountyBoard internal mock;

    uint256 internal constant BOUNTY_ID = 42;
    bytes32 internal constant REASON = keccak256("reason");

    function setUp() public override {
        super.setUp();
        mock = new MockBountyBoard();

        address[] memory arb = new address[](5);
        arb[0] = alice;
        arb[1] = bob;
        arb[2] = carol;
        arb[3] = dave;
        arb[4] = eve;
        council = new ArbiterCouncil(arb, 3, IBountyBoard(address(mock)));
    }

    /* ───────────── construction ───────────── */

    function test_Constructor_StoresArbiters() public view {
        assertEq(council.quorum(), 3);
        address[] memory list = council.arbiters();
        assertEq(list.length, 5);
        assertTrue(council.isArbiter(alice));
        assertTrue(council.isArbiter(bob));
        assertFalse(council.isArbiter(frank));
    }

    function test_Constructor_RevertsOnZeroQuorum() public {
        address[] memory arb = new address[](2);
        arb[0] = alice;
        arb[1] = bob;
        vm.expectRevert(ArbiterCouncil.InvalidQuorum.selector);
        new ArbiterCouncil(arb, 0, IBountyBoard(address(mock)));
    }

    function test_Constructor_RevertsOnQuorumExceedingArbiters() public {
        address[] memory arb = new address[](2);
        arb[0] = alice;
        arb[1] = bob;
        vm.expectRevert(ArbiterCouncil.InvalidQuorum.selector);
        new ArbiterCouncil(arb, 3, IBountyBoard(address(mock)));
    }

    function test_Constructor_RevertsOnEmptyArbiters() public {
        address[] memory arb = new address[](0);
        vm.expectRevert(ArbiterCouncil.InvalidQuorum.selector);
        new ArbiterCouncil(arb, 1, IBountyBoard(address(mock)));
    }

    function test_Constructor_RevertsOnDuplicateArbiter() public {
        address[] memory arb = new address[](2);
        arb[0] = alice;
        arb[1] = alice;
        vm.expectRevert(abi.encodeWithSelector(ArbiterCouncil.DuplicateArbiter.selector, alice));
        new ArbiterCouncil(arb, 1, IBountyBoard(address(mock)));
    }

    function test_Constructor_RevertsOnZeroArbiter() public {
        address[] memory arb = new address[](1);
        arb[0] = address(0);
        vm.expectRevert(ArbiterCouncil.ZeroArbiter.selector);
        new ArbiterCouncil(arb, 1, IBountyBoard(address(mock)));
    }

    function test_Constructor_RevertsOnZeroBountyBoard() public {
        address[] memory arb = new address[](1);
        arb[0] = alice;
        vm.expectRevert(ArbiterCouncil.ZeroAddress.selector);
        new ArbiterCouncil(arb, 1, IBountyBoard(address(0)));
    }

    /* ───────────── vote ───────────── */

    function test_Vote_ArbiterCanVoteAccept() public {
        vm.prank(alice);
        council.vote(BOUNTY_ID, false, REASON);
        (uint256 acceptCount, uint256 refundCount) = council.voteCounts(BOUNTY_ID);
        assertEq(acceptCount, 1);
        assertEq(refundCount, 0);
    }

    function test_Vote_ArbiterCanVoteRefund() public {
        vm.prank(alice);
        council.vote(BOUNTY_ID, true, REASON);
        (uint256 acceptCount, uint256 refundCount) = council.voteCounts(BOUNTY_ID);
        assertEq(acceptCount, 0);
        assertEq(refundCount, 1);
    }

    function test_Vote_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IArbiterCouncil.Voted(BOUNTY_ID, alice, true, REASON);
        vm.prank(alice);
        council.vote(BOUNTY_ID, true, REASON);
    }

    function test_Vote_RevertsForNonArbiter() public {
        vm.prank(frank);
        vm.expectRevert(abi.encodeWithSelector(ArbiterCouncil.NotArbiter.selector, frank));
        council.vote(BOUNTY_ID, false, REASON);
    }

    function test_Vote_RevertsOnDoubleVote() public {
        vm.prank(alice);
        council.vote(BOUNTY_ID, false, REASON);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArbiterCouncil.AlreadyVoted.selector, alice));
        council.vote(BOUNTY_ID, true, REASON);
    }

    /* ───────────── execute ───────────── */

    function test_Execute_QuorumAcceptCallsSettleAccept() public {
        _voteAll(false, 3);

        vm.prank(frank); // anyone can execute
        council.execute(BOUNTY_ID);

        assertTrue(mock.settleDisputeCalled(BOUNTY_ID));
        assertFalse(mock.lastSettleRefund(BOUNTY_ID));
        assertEq(mock.lastSettleCaller(), address(council));
        assertTrue(council.decisionExecuted(BOUNTY_ID));
    }

    function test_Execute_QuorumRefundCallsSettleRefund() public {
        _voteAll(true, 3);

        vm.prank(alice);
        council.execute(BOUNTY_ID);

        assertTrue(mock.settleDisputeCalled(BOUNTY_ID));
        assertTrue(mock.lastSettleRefund(BOUNTY_ID));
        assertTrue(council.decisionExecuted(BOUNTY_ID));
    }

    function test_Execute_EmitsEvent() public {
        _voteAll(false, 3);
        vm.expectEmit(true, false, false, true);
        emit IArbiterCouncil.Executed(BOUNTY_ID, false);
        council.execute(BOUNTY_ID);
    }

    function test_Execute_RevertsBelowQuorum() public {
        _voteAll(false, 2);
        vm.expectRevert(abi.encodeWithSelector(ArbiterCouncil.QuorumNotMet.selector, BOUNTY_ID));
        council.execute(BOUNTY_ID);
    }

    function test_Execute_RevertsIfAlreadyExecuted() public {
        _voteAll(false, 3);
        council.execute(BOUNTY_ID);
        vm.expectRevert(abi.encodeWithSelector(ArbiterCouncil.AlreadyExecuted.selector, BOUNTY_ID));
        council.execute(BOUNTY_ID);
    }

    function _voteAll(bool refund, uint8 howMany) internal {
        address[5] memory all = [alice, bob, carol, dave, eve];
        for (uint256 i = 0; i < howMany; i++) {
            vm.prank(all[i]);
            council.vote(BOUNTY_ID, refund, REASON);
        }
    }
}
