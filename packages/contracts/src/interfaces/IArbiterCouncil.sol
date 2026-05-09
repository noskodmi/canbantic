// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

interface IArbiterCouncil {
    event Voted(uint256 indexed bountyId, address indexed arbiter, bool refund, bytes32 reasonRef);
    event Executed(uint256 indexed bountyId, bool refunded);

    function vote(uint256 bountyId, bool refund, bytes32 reasonRef) external;
    function execute(uint256 bountyId) external;

    function quorum() external view returns (uint8);
    function arbiters() external view returns (address[] memory);
    function isArbiter(address candidate) external view returns (bool);
    function voteCounts(uint256 bountyId)
        external
        view
        returns (uint256 acceptCount, uint256 refundCount);
    function decisionExecuted(uint256 bountyId) external view returns (bool);
}
