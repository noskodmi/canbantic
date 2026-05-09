// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { IReputationAttestor } from "./interfaces/IReputationAttestor.sol";
import { IBountyBoard } from "./interfaces/IBountyBoard.sol";

/// @title ReputationAttestor
/// @notice Pure event sink: emits Attested(bountyId, agentNode, score)
///         when the bounty's poster signs off on settled work. The indexer
///         derives a per-agent reputation score from the event stream.
contract ReputationAttestor is IReputationAttestor {
    IBountyBoard public immutable bountyBoard;

    /// @dev (bountyId, reviewer) → has attested
    mapping(uint256 => mapping(address => bool)) private _attested;

    error InvalidScore(uint8 score);
    error NotBountyPoster(address caller, address expected);
    error AlreadyAttested(uint256 bountyId, address reviewer);
    error ZeroAddress();

    constructor(IBountyBoard bountyBoard_) {
        if (address(bountyBoard_) == address(0)) revert ZeroAddress();
        bountyBoard = bountyBoard_;
    }

    /// @inheritdoc IReputationAttestor
    function attest(uint256 bountyId, bytes32 agentNode, uint8 score, bytes32 commentRef) external {
        if (score < 1 || score > 5) revert InvalidScore(score);

        address expected = bountyBoard.posterOf(bountyId);
        if (msg.sender != expected) revert NotBountyPoster(msg.sender, expected);

        if (_attested[bountyId][msg.sender]) revert AlreadyAttested(bountyId, msg.sender);
        _attested[bountyId][msg.sender] = true;

        emit Attested(bountyId, agentNode, msg.sender, score, commentRef);
    }

    /// @inheritdoc IReputationAttestor
    function hasAttested(uint256 bountyId, address reviewer) external view returns (bool) {
        return _attested[bountyId][reviewer];
    }
}
