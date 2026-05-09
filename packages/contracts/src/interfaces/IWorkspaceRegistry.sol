// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

interface IWorkspaceRegistry {
    event WorkspaceCreated(
        bytes32 indexed wsNode, bytes32 indexed parentNode, address indexed admin
    );
    event MemberAdded(bytes32 indexed wsNode, address indexed member);
    event MemberRemoved(bytes32 indexed wsNode, address indexed member);
    event AdminTransferred(
        bytes32 indexed wsNode, address indexed oldAdmin, address indexed newAdmin
    );

    function createWorkspace(bytes32 parentNode, address[] calldata initialMembers)
        external
        returns (bytes32 wsNode);

    function addMember(bytes32 wsNode, address member) external;
    function removeMember(bytes32 wsNode, address member) external;
    function transferAdmin(bytes32 wsNode, address newAdmin) external;

    function isMember(bytes32 wsNode, address user) external view returns (bool);
    function membersOf(bytes32 wsNode) external view returns (address[] memory);
    function adminOf(bytes32 wsNode) external view returns (address);
    function exists(bytes32 wsNode) external view returns (bool);
}
