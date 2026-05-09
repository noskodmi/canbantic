// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { TestBase } from "./helpers/TestBase.sol";
import { WorkspaceRegistry } from "../src/WorkspaceRegistry.sol";
import { IWorkspaceRegistry } from "../src/interfaces/IWorkspaceRegistry.sol";

contract WorkspaceRegistryTest is TestBase {
    WorkspaceRegistry internal registry;

    function setUp() public override {
        super.setUp();
        registry = new WorkspaceRegistry();
    }

    /* ───────────── createWorkspace ───────────── */

    function test_CreateWorkspace_StoresAdminAndCreatorMember() public {
        address[] memory members = new address[](0);

        vm.prank(admin);
        bytes32 wsNode = registry.createWorkspace(ACME_PARENT, members);

        assertEq(wsNode, ACME_PARENT, "wsNode equals parentNode");
        assertTrue(registry.exists(wsNode));
        assertEq(registry.adminOf(wsNode), admin);
        assertTrue(registry.isMember(wsNode, admin), "creator is auto-member");
    }

    function test_CreateWorkspace_AddsInitialMembers() public {
        address[] memory members = new address[](2);
        members[0] = alice;
        members[1] = bob;

        vm.prank(admin);
        bytes32 wsNode = registry.createWorkspace(ACME_PARENT, members);

        assertTrue(registry.isMember(wsNode, alice));
        assertTrue(registry.isMember(wsNode, bob));
        address[] memory listed = registry.membersOf(wsNode);
        assertEq(listed.length, 3, "admin + 2 initial");
    }

    function test_CreateWorkspace_DedupesDuplicateInitialMembers() public {
        address[] memory members = new address[](2);
        members[0] = alice;
        members[1] = alice;

        vm.prank(admin);
        bytes32 wsNode = registry.createWorkspace(ACME_PARENT, members);

        address[] memory listed = registry.membersOf(wsNode);
        assertEq(listed.length, 2, "admin + alice (deduped)");
    }

    function test_CreateWorkspace_EmitsEvents() public {
        address[] memory members = new address[](1);
        members[0] = alice;

        vm.expectEmit(true, true, false, true);
        emit IWorkspaceRegistry.MemberAdded(ACME_PARENT, alice);
        vm.expectEmit(true, true, true, true);
        emit IWorkspaceRegistry.WorkspaceCreated(ACME_PARENT, ACME_PARENT, admin);

        vm.prank(admin);
        registry.createWorkspace(ACME_PARENT, members);
    }

    function test_CreateWorkspace_RevertsOnZeroParent() public {
        address[] memory members = new address[](0);

        vm.prank(admin);
        vm.expectRevert(WorkspaceRegistry.ZeroParent.selector);
        registry.createWorkspace(bytes32(0), members);
    }

    function test_CreateWorkspace_RevertsOnDuplicateWorkspace() public {
        address[] memory members = new address[](0);

        vm.prank(admin);
        registry.createWorkspace(ACME_PARENT, members);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(WorkspaceRegistry.WorkspaceAlreadyExists.selector, ACME_PARENT)
        );
        registry.createWorkspace(ACME_PARENT, members);
    }

    function test_CreateWorkspace_RevertsOnZeroAddressInInitialMembers() public {
        address[] memory members = new address[](1);
        members[0] = address(0);

        vm.prank(admin);
        vm.expectRevert(WorkspaceRegistry.ZeroAddress.selector);
        registry.createWorkspace(ACME_PARENT, members);
    }

    /* ───────────── addMember ───────────── */

    function test_AddMember_AdminCanAdd() public {
        _createDefault();
        vm.prank(admin);
        registry.addMember(ACME_PARENT, alice);
        assertTrue(registry.isMember(ACME_PARENT, alice));
    }

    function test_AddMember_EmitsEvent() public {
        _createDefault();
        vm.expectEmit(true, true, false, false);
        emit IWorkspaceRegistry.MemberAdded(ACME_PARENT, alice);
        vm.prank(admin);
        registry.addMember(ACME_PARENT, alice);
    }

    function test_AddMember_RevertsIfNotAdmin() public {
        _createDefault();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(WorkspaceRegistry.NotAdmin.selector, alice));
        registry.addMember(ACME_PARENT, bob);
    }

    function test_AddMember_RevertsIfWorkspaceMissing() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(WorkspaceRegistry.WorkspaceNotFound.selector, ACME_PARENT)
        );
        registry.addMember(ACME_PARENT, alice);
    }

    function test_AddMember_RevertsOnZeroAddress() public {
        _createDefault();
        vm.prank(admin);
        vm.expectRevert(WorkspaceRegistry.ZeroAddress.selector);
        registry.addMember(ACME_PARENT, address(0));
    }

    function test_AddMember_RevertsIfAlreadyMember() public {
        _createDefault();
        vm.prank(admin);
        registry.addMember(ACME_PARENT, alice);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(WorkspaceRegistry.AlreadyMember.selector, alice));
        registry.addMember(ACME_PARENT, alice);
    }

    /* ───────────── removeMember ───────────── */

    function test_RemoveMember_AdminCanRemove() public {
        _createDefault();
        vm.prank(admin);
        registry.addMember(ACME_PARENT, alice);
        vm.prank(admin);
        registry.removeMember(ACME_PARENT, alice);
        assertFalse(registry.isMember(ACME_PARENT, alice));
    }

    function test_RemoveMember_EmitsEvent() public {
        _createDefault();
        vm.prank(admin);
        registry.addMember(ACME_PARENT, alice);
        vm.expectEmit(true, true, false, false);
        emit IWorkspaceRegistry.MemberRemoved(ACME_PARENT, alice);
        vm.prank(admin);
        registry.removeMember(ACME_PARENT, alice);
    }

    function test_RemoveMember_RevertsIfNotAdmin() public {
        _createDefault();
        vm.prank(admin);
        registry.addMember(ACME_PARENT, alice);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(WorkspaceRegistry.NotAdmin.selector, bob));
        registry.removeMember(ACME_PARENT, alice);
    }

    function test_RemoveMember_RevertsIfNotMember() public {
        _createDefault();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(WorkspaceRegistry.NotMember.selector, alice));
        registry.removeMember(ACME_PARENT, alice);
    }

    function test_RemoveMember_RevertsIfWorkspaceMissing() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(WorkspaceRegistry.WorkspaceNotFound.selector, ACME_PARENT)
        );
        registry.removeMember(ACME_PARENT, alice);
    }

    function test_MembersOf_FiltersRemovedMembers() public {
        _createDefault();
        vm.prank(admin);
        registry.addMember(ACME_PARENT, alice);
        vm.prank(admin);
        registry.addMember(ACME_PARENT, bob);
        vm.prank(admin);
        registry.removeMember(ACME_PARENT, alice);

        address[] memory listed = registry.membersOf(ACME_PARENT);
        assertEq(listed.length, 2, "admin + bob");
        assertTrue(listed[0] == admin || listed[1] == admin);
        assertTrue(listed[0] == bob || listed[1] == bob);
    }

    /* ───────────── transferAdmin ───────────── */

    function test_TransferAdmin_AdminCanTransfer() public {
        _createDefault();
        vm.prank(admin);
        registry.transferAdmin(ACME_PARENT, alice);
        assertEq(registry.adminOf(ACME_PARENT), alice);
        assertTrue(registry.isMember(ACME_PARENT, alice), "new admin auto-member");
    }

    function test_TransferAdmin_EmitsEvent() public {
        _createDefault();
        vm.expectEmit(true, true, true, false);
        emit IWorkspaceRegistry.AdminTransferred(ACME_PARENT, admin, alice);
        vm.prank(admin);
        registry.transferAdmin(ACME_PARENT, alice);
    }

    function test_TransferAdmin_DoesNotDoubleAddIfAlreadyMember() public {
        _createDefault();
        vm.prank(admin);
        registry.addMember(ACME_PARENT, alice);
        vm.prank(admin);
        registry.transferAdmin(ACME_PARENT, alice);

        address[] memory listed = registry.membersOf(ACME_PARENT);
        assertEq(listed.length, 2, "admin + alice (no double-add)");
    }

    function test_TransferAdmin_RevertsIfNotAdmin() public {
        _createDefault();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(WorkspaceRegistry.NotAdmin.selector, alice));
        registry.transferAdmin(ACME_PARENT, bob);
    }

    function test_TransferAdmin_RevertsOnZeroAddress() public {
        _createDefault();
        vm.prank(admin);
        vm.expectRevert(WorkspaceRegistry.ZeroAddress.selector);
        registry.transferAdmin(ACME_PARENT, address(0));
    }

    function test_TransferAdmin_RevertsIfWorkspaceMissing() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(WorkspaceRegistry.WorkspaceNotFound.selector, ACME_PARENT)
        );
        registry.transferAdmin(ACME_PARENT, alice);
    }

    /* ───────────── views ───────────── */

    function test_AdminOf_ReturnsZeroForMissingWorkspace() public view {
        assertEq(registry.adminOf(ACME_PARENT), address(0));
    }

    function test_Exists_FalseForMissingWorkspace() public view {
        assertFalse(registry.exists(ACME_PARENT));
    }

    function test_IsMember_FalseForMissingWorkspace() public view {
        assertFalse(registry.isMember(ACME_PARENT, alice));
    }

    function _createDefault() internal {
        address[] memory empty = new address[](0);
        vm.prank(admin);
        registry.createWorkspace(ACME_PARENT, empty);
    }
}
