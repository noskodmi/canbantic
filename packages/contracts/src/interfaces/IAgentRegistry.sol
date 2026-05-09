// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

interface IAgentRegistry {
    struct Record {
        address owner;
        string mcpEndpoint;
        string capabilities;
        bytes32 profileRef;
        uint64 registeredAtBlock;
        bool exists;
    }

    event AgentRegistered(
        bytes32 indexed node,
        bytes32 indexed parent,
        address indexed owner,
        string label,
        string mcpEndpoint,
        string capabilities
    );
    event AgentUpdated(
        bytes32 indexed node, address indexed owner, string mcpEndpoint, string capabilities
    );
    event AgentTransferred(bytes32 indexed node, address indexed from, address indexed to);
    event ProfileSet(bytes32 indexed node, bytes32 profileRef);

    function register(
        bytes32 parentNode,
        string calldata label,
        string calldata mcpEndpoint,
        string calldata capabilities
    ) external returns (bytes32 node);

    function update(bytes32 node, string calldata mcpEndpoint, string calldata capabilities)
        external;
    function transferOwner(bytes32 node, address newOwner) external;
    function setProfileRef(bytes32 node, bytes32 profileRef) external;

    function recordOf(bytes32 node) external view returns (Record memory);
    function nodeFor(bytes32 parentNode, string calldata label) external pure returns (bytes32);
    function isRegistered(bytes32 node) external view returns (bool);
    function ownerOf(bytes32 node) external view returns (address);
}
