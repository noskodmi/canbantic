// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { TestBase } from "./helpers/TestBase.sol";
import { MockBountyBoard } from "./helpers/MockBountyBoard.sol";
import { ReputationAttestor } from "../src/ReputationAttestor.sol";
import { IReputationAttestor } from "../src/interfaces/IReputationAttestor.sol";
import { IBountyBoard } from "../src/interfaces/IBountyBoard.sol";

contract ReputationAttestorTest is TestBase {
    ReputationAttestor internal attestor;
    MockBountyBoard internal mock;

    bytes32 internal constant AGENT_NODE = keccak256("agent");
    bytes32 internal constant COMMENT = keccak256("nice work");
    uint256 internal constant BOUNTY_ID = 1;

    function setUp() public override {
        super.setUp();
        mock = new MockBountyBoard();
        attestor = new ReputationAttestor(IBountyBoard(address(mock)));
        mock.setPoster(BOUNTY_ID, poster);
    }

    function test_Attest_PosterCanAttest() public {
        vm.prank(poster);
        attestor.attest(BOUNTY_ID, AGENT_NODE, 5, COMMENT);
        assertTrue(attestor.hasAttested(BOUNTY_ID, poster));
    }

    function test_Attest_EmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit IReputationAttestor.Attested(BOUNTY_ID, AGENT_NODE, poster, 5, COMMENT);
        vm.prank(poster);
        attestor.attest(BOUNTY_ID, AGENT_NODE, 5, COMMENT);
    }

    function test_Attest_AcceptsBoundaryScores() public {
        mock.setPoster(2, alice);
        mock.setPoster(3, bob);

        vm.prank(alice);
        attestor.attest(2, AGENT_NODE, 1, COMMENT);

        vm.prank(bob);
        attestor.attest(3, AGENT_NODE, 5, COMMENT);
    }

    function test_Attest_RevertsOnZeroScore() public {
        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(ReputationAttestor.InvalidScore.selector, 0));
        attestor.attest(BOUNTY_ID, AGENT_NODE, 0, COMMENT);
    }

    function test_Attest_RevertsOnScoreAbove5() public {
        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(ReputationAttestor.InvalidScore.selector, 6));
        attestor.attest(BOUNTY_ID, AGENT_NODE, 6, COMMENT);
    }

    function test_Attest_RevertsIfNotPoster() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ReputationAttestor.NotBountyPoster.selector, alice, poster)
        );
        attestor.attest(BOUNTY_ID, AGENT_NODE, 5, COMMENT);
    }

    function test_Attest_RevertsOnDoubleAttest() public {
        vm.prank(poster);
        attestor.attest(BOUNTY_ID, AGENT_NODE, 5, COMMENT);

        vm.prank(poster);
        vm.expectRevert(
            abi.encodeWithSelector(ReputationAttestor.AlreadyAttested.selector, BOUNTY_ID, poster)
        );
        attestor.attest(BOUNTY_ID, AGENT_NODE, 4, COMMENT);
    }

    function test_HasAttested_FalseUntilAttest() public {
        assertFalse(attestor.hasAttested(BOUNTY_ID, poster));
        vm.prank(poster);
        attestor.attest(BOUNTY_ID, AGENT_NODE, 5, COMMENT);
        assertTrue(attestor.hasAttested(BOUNTY_ID, poster));
    }

    function test_Constructor_RevertsOnZeroBountyBoard() public {
        vm.expectRevert(ReputationAttestor.ZeroAddress.selector);
        new ReputationAttestor(IBountyBoard(address(0)));
    }
}
