// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { IAgentRegistry } from "./interfaces/IAgentRegistry.sol";
import { IWorkspaceRegistry } from "./interfaces/IWorkspaceRegistry.sol";

/// @title AgentRegistry
/// @notice ENS-namehash-keyed registry for agents. The same contract serves
///         public agents (parentNode == 0) and workspace agents (parentNode
///         set to a WorkspaceRegistry node, gated by membership).
contract AgentRegistry is IAgentRegistry {
    IWorkspaceRegistry public immutable workspaceRegistry;

    mapping(bytes32 => Record) private _records;

    error EmptyLabel();
    error AlreadyRegistered(bytes32 node);
    error NotRegistered(bytes32 node);
    error NotOwner(address caller);
    error NotWorkspaceMember(bytes32 parent, address caller);
    error ZeroAddress();

    constructor(IWorkspaceRegistry workspaceRegistry_) {
        workspaceRegistry = workspaceRegistry_;
    }

    /// @inheritdoc IAgentRegistry
    function register(
        bytes32 parentNode,
        string calldata label,
        string calldata mcpEndpoint,
        string calldata capabilities
    ) external returns (bytes32 node) {
        if (bytes(label).length == 0) revert EmptyLabel();

        if (parentNode != bytes32(0)) {
            if (!workspaceRegistry.isMember(parentNode, msg.sender)) {
                revert NotWorkspaceMember(parentNode, msg.sender);
            }
        }

        node = _nodeFor(parentNode, label);
        if (_records[node].exists) revert AlreadyRegistered(node);

        _records[node] = Record({
            owner: msg.sender,
            mcpEndpoint: mcpEndpoint,
            capabilities: capabilities,
            profileRef: bytes32(0),
            registeredAtBlock: uint64(block.number),
            exists: true
        });

        emit AgentRegistered(node, parentNode, msg.sender, label, mcpEndpoint, capabilities);
    }

    /// @inheritdoc IAgentRegistry
    function update(bytes32 node, string calldata mcpEndpoint, string calldata capabilities)
        external
    {
        Record storage r = _records[node];
        if (!r.exists) revert NotRegistered(node);
        if (msg.sender != r.owner) revert NotOwner(msg.sender);

        r.mcpEndpoint = mcpEndpoint;
        r.capabilities = capabilities;
        emit AgentUpdated(node, r.owner, mcpEndpoint, capabilities);
    }

    /// @inheritdoc IAgentRegistry
    function transferOwner(bytes32 node, address newOwner) external {
        Record storage r = _records[node];
        if (!r.exists) revert NotRegistered(node);
        if (msg.sender != r.owner) revert NotOwner(msg.sender);
        if (newOwner == address(0)) revert ZeroAddress();

        address oldOwner = r.owner;
        r.owner = newOwner;
        emit AgentTransferred(node, oldOwner, newOwner);
    }

    /// @inheritdoc IAgentRegistry
    function setProfileRef(bytes32 node, bytes32 profileRef) external {
        Record storage r = _records[node];
        if (!r.exists) revert NotRegistered(node);
        if (msg.sender != r.owner) revert NotOwner(msg.sender);

        r.profileRef = profileRef;
        emit ProfileSet(node, profileRef);
    }

    /// @inheritdoc IAgentRegistry
    function recordOf(bytes32 node) external view returns (Record memory) {
        return _records[node];
    }

    /// @inheritdoc IAgentRegistry
    function nodeFor(bytes32 parentNode, string calldata label) external pure returns (bytes32) {
        return _nodeFor(parentNode, label);
    }

    /// @inheritdoc IAgentRegistry
    function isRegistered(bytes32 node) external view returns (bool) {
        return _records[node].exists;
    }

    /// @inheritdoc IAgentRegistry
    function ownerOf(bytes32 node) external view returns (address) {
        return _records[node].owner;
    }

    function _nodeFor(bytes32 parentNode, string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }
}
