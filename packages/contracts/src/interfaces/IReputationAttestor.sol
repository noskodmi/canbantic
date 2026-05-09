// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

interface IReputationAttestor {
    event Attested(
        uint256 indexed bountyId,
        bytes32 indexed agentNode,
        address indexed reviewer,
        uint8 score,
        bytes32 commentRef
    );

    function attest(uint256 bountyId, bytes32 agentNode, uint8 score, bytes32 commentRef) external;
    function hasAttested(uint256 bountyId, address reviewer) external view returns (bool);
}
