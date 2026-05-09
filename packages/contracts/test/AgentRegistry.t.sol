// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { TestBase } from "./helpers/TestBase.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { IAgentRegistry } from "../src/interfaces/IAgentRegistry.sol";
import { WorkspaceRegistry } from "../src/WorkspaceRegistry.sol";

contract AgentRegistryTest is TestBase {
    AgentRegistry internal registry;
    WorkspaceRegistry internal workspaces;

    string internal constant LABEL = "gpt-research";
    string internal constant MCP_ENDPOINT = "https://api.example.com/mcp";
    string internal constant CAPABILITIES = "research,summarize";

    function setUp() public override {
        super.setUp();
        workspaces = new WorkspaceRegistry();
        registry = new AgentRegistry(workspaces);
    }

    /* ───────────── register (public, root parent) ───────────── */

    function test_Register_StoresRecord() public {
        vm.prank(alice);
        bytes32 node = registry.register(ROOT_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);

        IAgentRegistry.Record memory r = registry.recordOf(node);
        assertTrue(r.exists);
        assertEq(r.owner, alice);
        assertEq(r.mcpEndpoint, MCP_ENDPOINT);
        assertEq(r.capabilities, CAPABILITIES);
        assertEq(r.profileRef, bytes32(0));
        assertEq(r.registeredAtBlock, uint64(block.number));
    }

    function test_Register_NodeMatchesNodeFor() public {
        vm.prank(alice);
        bytes32 node = registry.register(ROOT_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);
        assertEq(node, registry.nodeFor(ROOT_PARENT, LABEL));
    }

    function test_Register_EmitsEvent() public {
        bytes32 expected = registry.nodeFor(ROOT_PARENT, LABEL);
        vm.expectEmit(true, true, true, true);
        emit IAgentRegistry.AgentRegistered(
            expected, ROOT_PARENT, alice, LABEL, MCP_ENDPOINT, CAPABILITIES
        );
        vm.prank(alice);
        registry.register(ROOT_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);
    }

    function test_Register_AnyoneCanRegisterUnderRoot() public {
        vm.prank(bob);
        registry.register(ROOT_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);
        bytes32 node = registry.nodeFor(ROOT_PARENT, LABEL);
        assertEq(registry.recordOf(node).owner, bob);
    }

    function test_Register_RevertsOnEmptyLabel() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.EmptyLabel.selector);
        registry.register(ROOT_PARENT, "", MCP_ENDPOINT, CAPABILITIES);
    }

    function test_Register_RevertsOnDuplicateNode() public {
        vm.prank(alice);
        registry.register(ROOT_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);

        vm.prank(bob);
        bytes32 node = registry.nodeFor(ROOT_PARENT, LABEL);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AlreadyRegistered.selector, node));
        registry.register(ROOT_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);
    }

    /* ───────────── register (workspace parent) ───────────── */

    function test_Register_WorkspaceMemberCanRegister() public {
        _createWorkspaceWith(alice);

        vm.prank(alice);
        bytes32 node = registry.register(ACME_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);

        assertEq(node, registry.nodeFor(ACME_PARENT, LABEL));
        assertEq(registry.recordOf(node).owner, alice);
    }

    function test_Register_RevertsIfNotWorkspaceMember() public {
        _createWorkspaceWith(alice);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.NotWorkspaceMember.selector, ACME_PARENT, bob)
        );
        registry.register(ACME_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);
    }

    function test_Register_RevertsIfWorkspaceMissing() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRegistry.NotWorkspaceMember.selector, ACME_PARENT, alice)
        );
        registry.register(ACME_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);
    }

    /* ───────────── update ───────────── */

    function test_Update_OwnerCanUpdate() public {
        bytes32 node = _registerPublic(alice);

        vm.prank(alice);
        registry.update(node, "https://new.example.com", "research,write");

        IAgentRegistry.Record memory r = registry.recordOf(node);
        assertEq(r.mcpEndpoint, "https://new.example.com");
        assertEq(r.capabilities, "research,write");
    }

    function test_Update_EmitsEvent() public {
        bytes32 node = _registerPublic(alice);

        vm.expectEmit(true, true, false, true);
        emit IAgentRegistry.AgentUpdated(node, alice, "new", "tagX");
        vm.prank(alice);
        registry.update(node, "new", "tagX");
    }

    function test_Update_RevertsIfNotOwner() public {
        bytes32 node = _registerPublic(alice);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotOwner.selector, bob));
        registry.update(node, "x", "y");
    }

    function test_Update_RevertsIfNotRegistered() public {
        bytes32 node = registry.nodeFor(ROOT_PARENT, LABEL);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotRegistered.selector, node));
        registry.update(node, "x", "y");
    }

    /* ───────────── transferOwner ───────────── */

    function test_TransferOwner_OwnerCanTransfer() public {
        bytes32 node = _registerPublic(alice);

        vm.prank(alice);
        registry.transferOwner(node, bob);

        assertEq(registry.recordOf(node).owner, bob);
        assertEq(registry.ownerOf(node), bob);
    }

    function test_TransferOwner_EmitsEvent() public {
        bytes32 node = _registerPublic(alice);

        vm.expectEmit(true, true, true, false);
        emit IAgentRegistry.AgentTransferred(node, alice, bob);
        vm.prank(alice);
        registry.transferOwner(node, bob);
    }

    function test_TransferOwner_RevertsIfNotOwner() public {
        bytes32 node = _registerPublic(alice);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotOwner.selector, bob));
        registry.transferOwner(node, carol);
    }

    function test_TransferOwner_RevertsOnZeroAddress() public {
        bytes32 node = _registerPublic(alice);

        vm.prank(alice);
        vm.expectRevert(AgentRegistry.ZeroAddress.selector);
        registry.transferOwner(node, address(0));
    }

    function test_TransferOwner_RevertsIfNotRegistered() public {
        bytes32 node = registry.nodeFor(ROOT_PARENT, LABEL);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotRegistered.selector, node));
        registry.transferOwner(node, bob);
    }

    /* ───────────── setProfileRef ───────────── */

    function test_SetProfileRef_OwnerCanSet() public {
        bytes32 node = _registerPublic(alice);
        bytes32 ref = bytes32(uint256(0xabc));

        vm.prank(alice);
        registry.setProfileRef(node, ref);

        assertEq(registry.recordOf(node).profileRef, ref);
    }

    function test_SetProfileRef_EmitsEvent() public {
        bytes32 node = _registerPublic(alice);
        bytes32 ref = bytes32(uint256(0xdef));

        vm.expectEmit(true, false, false, true);
        emit IAgentRegistry.ProfileSet(node, ref);
        vm.prank(alice);
        registry.setProfileRef(node, ref);
    }

    function test_SetProfileRef_RevertsIfNotOwner() public {
        bytes32 node = _registerPublic(alice);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotOwner.selector, bob));
        registry.setProfileRef(node, bytes32(uint256(1)));
    }

    /* ───────────── views ───────────── */

    function test_NodeFor_DeterministicHashing() public view {
        bytes32 a = registry.nodeFor(ROOT_PARENT, "alpha");
        bytes32 b = registry.nodeFor(ROOT_PARENT, "alpha");
        assertEq(a, b);
        bytes32 c = registry.nodeFor(ROOT_PARENT, "beta");
        assertNotEq(a, c);
    }

    function test_IsRegistered_FalseForUnknown() public view {
        assertFalse(registry.isRegistered(bytes32(uint256(123))));
    }

    function test_OwnerOf_ZeroForUnknown() public view {
        assertEq(registry.ownerOf(bytes32(uint256(123))), address(0));
    }

    function _registerPublic(address asAddr) internal returns (bytes32 node) {
        vm.prank(asAddr);
        node = registry.register(ROOT_PARENT, LABEL, MCP_ENDPOINT, CAPABILITIES);
    }

    function _createWorkspaceWith(address asAddr) internal {
        address[] memory empty = new address[](0);
        vm.prank(asAddr);
        workspaces.createWorkspace(ACME_PARENT, empty);
    }
}
