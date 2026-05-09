// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { IWorkspaceRegistry } from "./interfaces/IWorkspaceRegistry.sol";

/// @title WorkspaceRegistry
/// @notice ENS-shaped namespace + member set. Used by AgentRegistry and
///         BountyBoard to gate non-zero-parent operations to org members.
/// @dev v1 trusts off-chain that the workspace creator owns the parent
///      ENS name. The UI surfaces the ENS owner address as social proof.
///      v2 may integrate ENS NameWrapper to prove on-chain authority.
contract WorkspaceRegistry is IWorkspaceRegistry {
    struct Workspace {
        bytes32 parentNode;
        address admin;
        bool exists;
    }

    /// @dev wsNode → workspace record
    mapping(bytes32 => Workspace) private _workspaces;
    /// @dev wsNode → member address → bool
    mapping(bytes32 => mapping(address => bool)) private _isMember;
    /// @dev wsNode → all addresses ever added (never compacted; views filter)
    mapping(bytes32 => address[]) private _memberList;

    error ZeroParent();
    error ZeroAddress();
    error WorkspaceAlreadyExists(bytes32 wsNode);
    error WorkspaceNotFound(bytes32 wsNode);
    error NotAdmin(address caller);
    error AlreadyMember(address member);
    error NotMember(address member);

    /// @inheritdoc IWorkspaceRegistry
    function createWorkspace(bytes32 parentNode, address[] calldata initialMembers)
        external
        returns (bytes32 wsNode)
    {
        if (parentNode == bytes32(0)) revert ZeroParent();
        wsNode = parentNode;
        if (_workspaces[wsNode].exists) revert WorkspaceAlreadyExists(wsNode);

        _workspaces[wsNode] = Workspace({ parentNode: parentNode, admin: msg.sender, exists: true });

        // Creator is implicit admin and member.
        _isMember[wsNode][msg.sender] = true;
        _memberList[wsNode].push(msg.sender);

        for (uint256 i = 0; i < initialMembers.length; i++) {
            address m = initialMembers[i];
            if (m == address(0)) revert ZeroAddress();
            if (_isMember[wsNode][m]) {
                continue; // dedupe; idempotent.
            }
            _isMember[wsNode][m] = true;
            _memberList[wsNode].push(m);
            emit MemberAdded(wsNode, m);
        }

        emit WorkspaceCreated(wsNode, parentNode, msg.sender);
    }

    /// @inheritdoc IWorkspaceRegistry
    function addMember(bytes32 wsNode, address member) external {
        Workspace storage ws = _workspaces[wsNode];
        if (!ws.exists) revert WorkspaceNotFound(wsNode);
        if (msg.sender != ws.admin) revert NotAdmin(msg.sender);
        if (member == address(0)) revert ZeroAddress();
        if (_isMember[wsNode][member]) revert AlreadyMember(member);

        _isMember[wsNode][member] = true;
        _memberList[wsNode].push(member);
        emit MemberAdded(wsNode, member);
    }

    /// @inheritdoc IWorkspaceRegistry
    function removeMember(bytes32 wsNode, address member) external {
        Workspace storage ws = _workspaces[wsNode];
        if (!ws.exists) revert WorkspaceNotFound(wsNode);
        if (msg.sender != ws.admin) revert NotAdmin(msg.sender);
        if (!_isMember[wsNode][member]) revert NotMember(member);

        _isMember[wsNode][member] = false;
        emit MemberRemoved(wsNode, member);
    }

    /// @inheritdoc IWorkspaceRegistry
    function transferAdmin(bytes32 wsNode, address newAdmin) external {
        Workspace storage ws = _workspaces[wsNode];
        if (!ws.exists) revert WorkspaceNotFound(wsNode);
        if (msg.sender != ws.admin) revert NotAdmin(msg.sender);
        if (newAdmin == address(0)) revert ZeroAddress();

        address oldAdmin = ws.admin;
        ws.admin = newAdmin;

        if (!_isMember[wsNode][newAdmin]) {
            _isMember[wsNode][newAdmin] = true;
            _memberList[wsNode].push(newAdmin);
            emit MemberAdded(wsNode, newAdmin);
        }
        emit AdminTransferred(wsNode, oldAdmin, newAdmin);
    }

    /// @inheritdoc IWorkspaceRegistry
    function isMember(bytes32 wsNode, address user) external view returns (bool) {
        return _isMember[wsNode][user];
    }

    /// @inheritdoc IWorkspaceRegistry
    function membersOf(bytes32 wsNode) external view returns (address[] memory) {
        address[] storage all = _memberList[wsNode];
        uint256 n = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (_isMember[wsNode][all[i]]) n++;
        }
        address[] memory active = new address[](n);
        uint256 j = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (_isMember[wsNode][all[i]]) {
                active[j++] = all[i];
            }
        }
        return active;
    }

    /// @inheritdoc IWorkspaceRegistry
    function adminOf(bytes32 wsNode) external view returns (address) {
        return _workspaces[wsNode].admin;
    }

    /// @inheritdoc IWorkspaceRegistry
    function exists(bytes32 wsNode) external view returns (bool) {
        return _workspaces[wsNode].exists;
    }
}
