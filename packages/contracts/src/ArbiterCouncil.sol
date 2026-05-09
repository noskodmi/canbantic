// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { IArbiterCouncil } from "./interfaces/IArbiterCouncil.sol";
import { IBountyBoard } from "./interfaces/IBountyBoard.sol";

/// @title ArbiterCouncil
/// @notice Static N-of-M dispute resolver bound to a single BountyBoard.
///         Arbiters vote accept|refund. Once acceptCount or refundCount
///         reaches the quorum, anyone may call `execute` to settle the
///         disputed bounty via IBountyBoard.settleDispute.
contract ArbiterCouncil is IArbiterCouncil {
    IBountyBoard public immutable bountyBoard;
    uint8 public immutable override quorum;

    address[] private _arbiters;
    mapping(address => bool) private _isArbiter;

    /// @dev bountyId → arbiter → has voted
    mapping(uint256 => mapping(address => bool)) private _hasVoted;
    /// @dev bountyId → accept votes
    mapping(uint256 => uint256) private _acceptCount;
    /// @dev bountyId → refund votes
    mapping(uint256 => uint256) private _refundCount;
    /// @dev bountyId → has been executed
    mapping(uint256 => bool) private _executed;

    error InvalidQuorum();
    error ZeroArbiter();
    error ZeroAddress();
    error DuplicateArbiter(address arbiter);
    error NotArbiter(address caller);
    error AlreadyVoted(address arbiter);
    error QuorumNotMet(uint256 bountyId);
    error AlreadyExecuted(uint256 bountyId);

    constructor(address[] memory arbiters_, uint8 quorum_, IBountyBoard bountyBoard_) {
        if (address(bountyBoard_) == address(0)) revert ZeroAddress();
        if (arbiters_.length == 0 || quorum_ == 0 || quorum_ > arbiters_.length) {
            revert InvalidQuorum();
        }
        for (uint256 i = 0; i < arbiters_.length; i++) {
            address a = arbiters_[i];
            if (a == address(0)) revert ZeroArbiter();
            if (_isArbiter[a]) revert DuplicateArbiter(a);
            _isArbiter[a] = true;
            _arbiters.push(a);
        }
        quorum = quorum_;
        bountyBoard = bountyBoard_;
    }

    /// @inheritdoc IArbiterCouncil
    function vote(uint256 bountyId, bool refund, bytes32 reasonRef) external {
        if (!_isArbiter[msg.sender]) revert NotArbiter(msg.sender);
        if (_hasVoted[bountyId][msg.sender]) revert AlreadyVoted(msg.sender);

        _hasVoted[bountyId][msg.sender] = true;
        if (refund) {
            _refundCount[bountyId]++;
        } else {
            _acceptCount[bountyId]++;
        }
        emit Voted(bountyId, msg.sender, refund, reasonRef);
    }

    /// @inheritdoc IArbiterCouncil
    function execute(uint256 bountyId) external {
        if (_executed[bountyId]) revert AlreadyExecuted(bountyId);

        bool refundDecision;
        if (_refundCount[bountyId] >= quorum) {
            refundDecision = true;
        } else if (_acceptCount[bountyId] >= quorum) {
            refundDecision = false;
        } else {
            revert QuorumNotMet(bountyId);
        }

        _executed[bountyId] = true;
        bountyBoard.settleDispute(bountyId, refundDecision);
        emit Executed(bountyId, refundDecision);
    }

    /// @inheritdoc IArbiterCouncil
    function arbiters() external view returns (address[] memory) {
        return _arbiters;
    }

    /// @inheritdoc IArbiterCouncil
    function isArbiter(address candidate) external view returns (bool) {
        return _isArbiter[candidate];
    }

    /// @inheritdoc IArbiterCouncil
    function voteCounts(uint256 bountyId)
        external
        view
        returns (uint256 acceptCount, uint256 refundCount)
    {
        return (_acceptCount[bountyId], _refundCount[bountyId]);
    }

    /// @inheritdoc IArbiterCouncil
    function decisionExecuted(uint256 bountyId) external view returns (bool) {
        return _executed[bountyId];
    }
}
