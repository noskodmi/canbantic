// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { TestBase } from "./helpers/TestBase.sol";
import { AgentVenture } from "../src/AgentVenture.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { BountyBoard } from "../src/BountyBoard.sol";
import { WorkspaceRegistry } from "../src/WorkspaceRegistry.sol";

contract AgentVentureTest is TestBase {
    AgentVenture internal venture;
    AgentRegistry internal agents;
    BountyBoard internal board;
    WorkspaceRegistry internal workspaces;

    string internal constant LABEL = "umia-spinout-bot";
    string internal constant MCP_ENDPOINT = "https://api.example.com/mcp";
    string internal constant CAPABILITIES = "research,write";
    string internal constant SWARM_URI = "swarm://bzz/abc123";
    bytes32 internal constant ACCRUED_REVENUE_ROOT = bytes32(uint256(0xc0ffeedecadefacadebabecafe));
    uint256 internal constant SPIN_OUT_THRESHOLD_WEI = 0.005 ether;

    bytes32 internal aliceAgentNode;

    function setUp() public override {
        super.setUp();
        workspaces = new WorkspaceRegistry();
        // Deployer doubles as the orbitportOracle — matches Deploy.s.sol
        // convention. The test never calls finalizeFairClaim so the value
        // is unused.
        board = new BountyBoard(workspaces, address(this));
        agents = new AgentRegistry(workspaces);
        venture = new AgentVenture(agents, board, SPIN_OUT_THRESHOLD_WEI);

        vm.prank(alice);
        aliceAgentNode = agents.register(ROOT_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);
    }

    /* ───────────── constructor ───────────── */

    function test_Constructor_PinsImmutables() public view {
        assertEq(address(venture.agentRegistry()), address(agents));
        assertEq(address(venture.bountyBoard()), address(board));
        assertEq(venture.spinOutThresholdWei(), SPIN_OUT_THRESHOLD_WEI);
    }

    function test_Constructor_NameAndSymbol() public view {
        assertEq(venture.name(), "Kanbantic Agent Venture");
        assertEq(venture.symbol(), "KAV");
    }

    function test_Constructor_RevertsOnZeroAgentRegistry() public {
        vm.expectRevert(AgentVenture.ZeroAddress.selector);
        new AgentVenture(AgentRegistry(address(0)), board, SPIN_OUT_THRESHOLD_WEI);
    }

    function test_Constructor_RevertsOnZeroBountyBoard() public {
        vm.expectRevert(AgentVenture.ZeroAddress.selector);
        new AgentVenture(agents, BountyBoard(address(0)), SPIN_OUT_THRESHOLD_WEI);
    }

    /* ───────────── mint ───────────── */

    function test_Mint_OwnerCanMint() public {
        vm.prank(alice);
        uint256 tokenId = venture.mint(aliceAgentNode, ACCRUED_REVENUE_ROOT, SWARM_URI);

        assertEq(tokenId, 1);
        assertEq(venture.ownerOf(tokenId), alice);
        assertEq(venture.agentNodeOf(tokenId), aliceAgentNode);
        assertEq(venture.accruedRevenueRootOf(tokenId), ACCRUED_REVENUE_ROOT);
        assertEq(venture.tokenURI(tokenId), SWARM_URI);
        assertEq(venture.balanceOf(alice), 1);
    }

    function test_Mint_TokenIdIncrements() public {
        // Register a second agent under bob.
        vm.prank(bob);
        bytes32 bobAgentNode = agents.register(ROOT_PARENT, "bobs-bot", MCP_ENDPOINT, CAPABILITIES);

        vm.prank(alice);
        uint256 first = venture.mint(aliceAgentNode, ACCRUED_REVENUE_ROOT, SWARM_URI);

        vm.prank(bob);
        uint256 second = venture.mint(bobAgentNode, bytes32(uint256(0x1234)), "swarm://bzz/two");

        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(venture.ownerOf(first), alice);
        assertEq(venture.ownerOf(second), bob);
        assertEq(venture.nextTokenId(), 3);
    }

    function test_Mint_EmitsAgentVentureMinted() public {
        vm.expectEmit(true, true, true, true);
        emit AgentVenture.AgentVentureMinted(
            1, aliceAgentNode, alice, ACCRUED_REVENUE_ROOT, SWARM_URI
        );
        vm.prank(alice);
        venture.mint(aliceAgentNode, ACCRUED_REVENUE_ROOT, SWARM_URI);
    }

    function test_Mint_RevertsIfNotAgentOwner() public {
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(AgentVenture.NotAgentOwner.selector, aliceAgentNode, bob)
        );
        venture.mint(aliceAgentNode, ACCRUED_REVENUE_ROOT, SWARM_URI);
    }

    function test_Mint_RevertsIfAgentNotRegistered() public {
        bytes32 unknownNode = keccak256("nope");
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AgentVenture.NotAgentOwner.selector, unknownNode, alice)
        );
        venture.mint(unknownNode, ACCRUED_REVENUE_ROOT, SWARM_URI);
    }

    /* ───────────── views ───────────── */

    function test_AgentNodeOf_RevertsForUnknownToken() public {
        vm.expectRevert(abi.encodeWithSelector(AgentVenture.UnknownToken.selector, uint256(99)));
        venture.agentNodeOf(99);
    }

    function test_AccruedRevenueRootOf_RevertsForUnknownToken() public {
        vm.expectRevert(abi.encodeWithSelector(AgentVenture.UnknownToken.selector, uint256(99)));
        venture.accruedRevenueRootOf(99);
    }

    function test_NextTokenId_StartsAtOne() public view {
        assertEq(venture.nextTokenId(), 1);
    }

    /* ───────────── ERC-721 transfer semantics ───────────── */

    function test_Transfer_OwnerCanTransfer() public {
        vm.prank(alice);
        uint256 tokenId = venture.mint(aliceAgentNode, ACCRUED_REVENUE_ROOT, SWARM_URI);

        vm.prank(alice);
        venture.transferFrom(alice, bob, tokenId);

        assertEq(venture.ownerOf(tokenId), bob);
        // Wrapped-agent identity is preserved across transfers — the venture
        // token represents a frozen snapshot, not an admin handle.
        assertEq(venture.agentNodeOf(tokenId), aliceAgentNode);
    }
}
