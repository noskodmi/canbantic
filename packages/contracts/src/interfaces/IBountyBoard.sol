// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

interface IBountyBoard {
    enum Status {
        None,
        Open,
        ClaimWindowOpen,
        ClaimWindowClosed,
        Claimed,
        Submitted,
        Resolved,
        Disputed,
        Refunded
    }

    struct Bounty {
        address poster;
        string capabilityFilter;
        uint256 reward;
        bytes32 descriptionRef;
        uint64 expiresAt;
        uint32 claimWindowBlocks;
        uint32 claimWindowStartBlock;
        Status status;
        bytes32 claimerNode;
        bytes32 submissionRef;
        bytes32 workspaceNode;
        address arbiterCouncil;
    }

    event BountyPosted(
        uint256 indexed id,
        address indexed poster,
        bytes32 indexed workspaceNode,
        string capabilityFilter,
        uint256 reward,
        bytes32 descriptionRef,
        uint64 expiresAt,
        uint32 claimWindowBlocks,
        address arbiterCouncil
    );
    event BountyClaimCommitted(uint256 indexed id, address indexed committer, bytes32 commitment);
    event BountyClaimFinalized(
        uint256 indexed id, address indexed pickedAddress, bytes32 ctrngDraw
    );
    event BountyClaimed(uint256 indexed id, bytes32 indexed agentNode, address indexed claimer);
    event BountySubmitted(uint256 indexed id, bytes32 proofRef);
    event BountyAccepted(uint256 indexed id, address indexed payee, uint256 amount);
    event BountyRejected(uint256 indexed id, bytes32 reasonRef);
    event BountySettled(uint256 indexed id, bool refunded);
    event BountyExpired(uint256 indexed id);

    function post(
        string calldata capabilityFilter,
        uint256 reward,
        bytes32 descriptionRef,
        uint64 expiresAt,
        uint32 claimWindowBlocks,
        bytes32 workspaceNode,
        address arbiterCouncil
    ) external payable returns (uint256 bountyId);

    function claim(uint256 bountyId, bytes32 agentNode) external;
    function commitClaim(uint256 bountyId, bytes32 commitment) external;
    function finalizeFairClaim(uint256 bountyId, bytes32 ctrngDraw, bytes calldata orbitportSig)
        external;
    function revealClaim(uint256 bountyId, bytes32 nonce, bytes32 agentNode) external;
    function submit(uint256 bountyId, bytes32 proofRef, bytes calldata ownerSignature) external;
    function accept(uint256 bountyId) external;
    function reject(uint256 bountyId, bytes32 reasonRef) external;
    function settleDispute(uint256 bountyId, bool refund) external;
    function expire(uint256 bountyId) external;

    function bountyOf(uint256 bountyId) external view returns (Bounty memory);
    function statusOf(uint256 bountyId) external view returns (Status);
    function posterOf(uint256 bountyId) external view returns (address);
    function nextId() external view returns (uint256);
}
