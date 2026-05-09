// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { TestBase } from "./helpers/TestBase.sol";
import { BountyBoard } from "../src/BountyBoard.sol";
import { IBountyBoard } from "../src/interfaces/IBountyBoard.sol";
import { WorkspaceRegistry } from "../src/WorkspaceRegistry.sol";
import { IWorkspaceRegistry } from "../src/interfaces/IWorkspaceRegistry.sol";

contract BountyBoardInstantTest is TestBase {
    BountyBoard internal board;
    WorkspaceRegistry internal workspaces;

    bytes32 internal constant DESC = keccak256("desc");
    bytes32 internal constant PROOF = keccak256("proof");
    bytes32 internal constant REASON = keccak256("reason");
    bytes32 internal constant AGENT = keccak256("agent");
    string internal constant CAP = "research";

    function setUp() public override {
        super.setUp();
        workspaces = new WorkspaceRegistry();
        board = new BountyBoard(workspaces, worker);
    }

    /* ───────────── constructor ───────────── */

    function test_Constructor_RevertsOnZeroWorkspaceRegistry() public {
        vm.expectRevert(BountyBoard.ZeroAddress.selector);
        new BountyBoard(IWorkspaceRegistry(address(0)), worker);
    }

    function test_Constructor_RevertsOnZeroOrbitportOracle() public {
        vm.expectRevert(BountyBoard.ZeroAddress.selector);
        new BountyBoard(workspaces, address(0));
    }

    /* ───────────── post ───────────── */

    function test_Post_StoresBountyAndEscrowsETH() public {
        uint256 reward = 0.01 ether;
        vm.prank(poster);
        uint256 id = board.post{ value: reward }(
            CAP, reward, DESC, uint64(block.timestamp + 1 days), 0, bytes32(0), address(0)
        );

        assertEq(id, 1);
        assertEq(address(board).balance, reward);

        IBountyBoard.Bounty memory b = board.bountyOf(id);
        assertEq(b.poster, poster);
        assertEq(b.reward, reward);
        assertEq(b.descriptionRef, DESC);
        assertEq(uint256(b.status), uint256(IBountyBoard.Status.Open));
        assertEq(b.workspaceNode, bytes32(0));
        assertEq(b.arbiterCouncil, address(0));
    }

    function test_Post_EmitsEvent() public {
        uint256 reward = 0.01 ether;
        vm.expectEmit(true, true, true, true);
        emit IBountyBoard.BountyPosted(
            1,
            poster,
            bytes32(0),
            CAP,
            reward,
            DESC,
            uint64(block.timestamp + 1 days),
            0,
            address(0)
        );
        vm.prank(poster);
        board.post{ value: reward }(
            CAP, reward, DESC, uint64(block.timestamp + 1 days), 0, bytes32(0), address(0)
        );
    }

    function test_Post_RevertsIfRewardMismatchValue() public {
        vm.prank(poster);
        vm.expectRevert(
            abi.encodeWithSelector(BountyBoard.RewardValueMismatch.selector, 0.01 ether, 0.02 ether)
        );
        board.post{ value: 0.02 ether }(
            CAP, 0.01 ether, DESC, uint64(block.timestamp + 1 days), 0, bytes32(0), address(0)
        );
    }

    function test_Post_RevertsOnZeroReward() public {
        vm.prank(poster);
        vm.expectRevert(BountyBoard.ZeroReward.selector);
        board.post{ value: 0 }(
            CAP, 0, DESC, uint64(block.timestamp + 1 days), 0, bytes32(0), address(0)
        );
    }

    function test_Post_RevertsOnPastExpiry() public {
        vm.warp(1000);
        vm.prank(poster);
        vm.expectRevert(BountyBoard.ExpiryInPast.selector);
        board.post{ value: 0.01 ether }(
            CAP, 0.01 ether, DESC, uint64(500), 0, bytes32(0), address(0)
        );
    }

    function test_Post_WorkspaceMemberCanPost() public {
        address[] memory empty = new address[](0);
        vm.prank(poster);
        workspaces.createWorkspace(ACME_PARENT, empty);

        vm.prank(poster);
        uint256 id = board.post{ value: 0.01 ether }(
            CAP, 0.01 ether, DESC, uint64(block.timestamp + 1 days), 0, ACME_PARENT, address(0)
        );

        assertEq(board.bountyOf(id).workspaceNode, ACME_PARENT);
    }

    function test_Post_RevertsIfNotWorkspaceMember() public {
        address[] memory empty = new address[](0);
        vm.prank(admin);
        workspaces.createWorkspace(ACME_PARENT, empty);

        vm.prank(poster);
        vm.expectRevert(
            abi.encodeWithSelector(BountyBoard.NotWorkspaceMember.selector, ACME_PARENT, poster)
        );
        board.post{ value: 0.01 ether }(
            CAP, 0.01 ether, DESC, uint64(block.timestamp + 1 days), 0, ACME_PARENT, address(0)
        );
    }

    /* ───────────── claim (instant) ───────────── */

    function test_Claim_InstantClaim_Succeeds() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);

        IBountyBoard.Bounty memory b = board.bountyOf(id);
        assertEq(uint256(b.status), uint256(IBountyBoard.Status.Claimed));
        assertEq(b.claimerNode, AGENT);
    }

    function test_Claim_EmitsEvent() public {
        uint256 id = _post(0);
        vm.expectEmit(true, true, true, false);
        emit IBountyBoard.BountyClaimed(id, AGENT, alice);
        vm.prank(alice);
        board.claim(id, AGENT);
    }

    function test_Claim_RevertsOnZeroAgentNode() public {
        uint256 id = _post(0);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.ZeroAgentNode.selector);
        board.claim(id, bytes32(0));
    }

    function test_Claim_RevertsIfBountyMissing() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.BadStatus.selector, 999));
        board.claim(999, AGENT);
    }

    function test_Claim_RevertsIfAlreadyClaimed() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.BadStatus.selector, id));
        board.claim(id, AGENT);
    }

    function test_Claim_RevertsIfFairClaimMode() public {
        uint256 id = _post(10);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.WrongClaimMode.selector, id));
        board.claim(id, AGENT);
    }

    /* ───────────── submit ───────────── */

    function test_Submit_OwnerSubmits() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);

        bytes memory sig = "0xownersig";
        vm.prank(alice);
        board.submit(id, PROOF, sig);

        IBountyBoard.Bounty memory b = board.bountyOf(id);
        assertEq(uint256(b.status), uint256(IBountyBoard.Status.Submitted));
        assertEq(b.submissionRef, PROOF);
    }

    function test_Submit_EmitsEvent() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);

        vm.expectEmit(true, false, false, true);
        emit IBountyBoard.BountySubmitted(id, PROOF);
        vm.prank(alice);
        board.submit(id, PROOF, "0xsig");
    }

    function test_Submit_RevertsIfNotClaimed() public {
        uint256 id = _post(0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.BadStatus.selector, id));
        board.submit(id, PROOF, "0xsig");
    }

    function test_Submit_RevertsIfNotClaimer() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.NotClaimer.selector, bob));
        board.submit(id, PROOF, "0xsig");
    }

    /* ───────────── accept ───────────── */

    function test_Accept_PaysOutClaimer() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.prank(alice);
        board.submit(id, PROOF, "0xsig");

        uint256 before = alice.balance;
        vm.prank(poster);
        board.accept(id);

        assertEq(alice.balance, before + 0.01 ether);
        assertEq(address(board).balance, 0);
        assertEq(uint256(board.statusOf(id)), uint256(IBountyBoard.Status.Resolved));
    }

    function test_Accept_EmitsEvent() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.prank(alice);
        board.submit(id, PROOF, "0xsig");

        vm.expectEmit(true, true, false, true);
        emit IBountyBoard.BountyAccepted(id, alice, 0.01 ether);
        vm.prank(poster);
        board.accept(id);
    }

    function test_Accept_RevertsIfNotPoster() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.prank(alice);
        board.submit(id, PROOF, "0xsig");

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.NotPoster.selector, bob));
        board.accept(id);
    }

    function test_Accept_RevertsIfNotSubmitted() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.BadStatus.selector, id));
        board.accept(id);
    }

    /* ───────────── reject ───────────── */

    function test_Reject_MovesToDisputedIfArbiterSet() public {
        uint256 id = _postWithArbiter(address(0xABCD));
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.prank(alice);
        board.submit(id, PROOF, "0xsig");

        vm.prank(poster);
        board.reject(id, REASON);

        assertEq(uint256(board.statusOf(id)), uint256(IBountyBoard.Status.Disputed));
    }

    function test_Reject_RefundsIfNoArbiter() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.prank(alice);
        board.submit(id, PROOF, "0xsig");

        uint256 before = poster.balance;
        vm.prank(poster);
        board.reject(id, REASON);

        assertEq(poster.balance, before + 0.01 ether);
        assertEq(uint256(board.statusOf(id)), uint256(IBountyBoard.Status.Refunded));
    }

    function test_Reject_RevertsIfNotPoster() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.prank(alice);
        board.submit(id, PROOF, "0xsig");

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.NotPoster.selector, bob));
        board.reject(id, REASON);
    }

    function test_Reject_RevertsIfNotSubmitted() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.BadStatus.selector, id));
        board.reject(id, REASON);
    }

    /* ───────────── expire ───────────── */

    function test_Expire_AnyoneCanExpireAfterDeadline() public {
        uint256 id = _post(0);
        vm.warp(block.timestamp + 2 days);

        uint256 before = poster.balance;
        vm.prank(frank);
        board.expire(id);

        assertEq(poster.balance, before + 0.01 ether);
        assertEq(uint256(board.statusOf(id)), uint256(IBountyBoard.Status.Refunded));
    }

    function test_Expire_RevertsBeforeDeadline() public {
        uint256 id = _post(0);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.NotYetExpired.selector, id));
        board.expire(id);
    }

    function test_Expire_RevertsIfBountyClaimed() public {
        uint256 id = _post(0);
        vm.prank(alice);
        board.claim(id, AGENT);
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.BadStatus.selector, id));
        board.expire(id);
    }

    /* ───────────── views ───────────── */

    function test_Views_NextIdIncrements() public {
        assertEq(board.nextId(), 1);
        _post(0);
        assertEq(board.nextId(), 2);
    }

    function test_Views_PosterOf() public {
        uint256 id = _post(0);
        assertEq(board.posterOf(id), poster);
    }

    function _post(uint32 claimWindow) internal returns (uint256) {
        vm.prank(poster);
        return board.post{ value: 0.01 ether }(
            CAP,
            0.01 ether,
            DESC,
            uint64(block.timestamp + 1 days),
            claimWindow,
            bytes32(0),
            address(0)
        );
    }

    function _postWithArbiter(address arb) internal returns (uint256) {
        vm.prank(poster);
        return board.post{ value: 0.01 ether }(
            CAP, 0.01 ether, DESC, uint64(block.timestamp + 1 days), 0, bytes32(0), arb
        );
    }
}
