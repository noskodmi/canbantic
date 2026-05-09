// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { IBountyBoard } from "../../src/interfaces/IBountyBoard.sol";

/// @notice Minimal IBountyBoard mock for ReputationAttestor + ArbiterCouncil
///         unit tests. Only `posterOf` and `settleDispute` are functional;
///         every other method reverts.
contract MockBountyBoard {
    mapping(uint256 => address) private _posters;
    mapping(uint256 => bool) public settleDisputeCalled;
    mapping(uint256 => bool) public lastSettleRefund;
    address public lastSettleCaller;

    function setPoster(uint256 bountyId, address poster) external {
        _posters[bountyId] = poster;
    }

    function posterOf(uint256 bountyId) external view returns (address) {
        return _posters[bountyId];
    }

    function settleDispute(uint256 bountyId, bool refund) external {
        settleDisputeCalled[bountyId] = true;
        lastSettleRefund[bountyId] = refund;
        lastSettleCaller = msg.sender;
    }
}
