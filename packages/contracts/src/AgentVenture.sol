// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { ERC721 } from "@openzeppelin/token/ERC721/ERC721.sol";
import { ERC721URIStorage } from "@openzeppelin/token/ERC721/extensions/ERC721URIStorage.sol";
import { IAgentRegistry } from "./interfaces/IAgentRegistry.sol";
import { IBountyBoard } from "./interfaces/IBountyBoard.sol";

/// @title AgentVenture
/// @notice ERC-721 wrapper used by the Umia spin-out flow (spec §6 Umia).
///         Each token represents a Kanbantic agent that has been promoted
///         into a "venture" — the token's metadata pins:
///         - `agentNode`            the AgentRegistry namehash being wrapped
///         - `accruedRevenueRoot`   poster-supplied commitment to the agent's
///                                  settled-revenue ledger (off-chain merkle
///                                  root in v0.1, recomputed on-chain in v0.2)
///         - `tokenURI`             a Swarm reference to the venture's
///                                  evidence bundle (manifest, repo snapshot,
///                                  bounty receipts) — stored opaquely.
///         The wrapped agent is identified by namehash, not address — owners
///         may change ENS records over time; the venture is keyed to identity.
/// @dev Phase 1 simplification: the on-chain `accruedRevenue` threshold check
///      is deferred to v0.2 because BountyBoard does not currently expose a
///      per-agent settled-revenue view. v0.1 gates `mint` purely on
///      `msg.sender == agentRegistry.ownerOf(agentNode)` and trusts the
///      caller-supplied `accruedRevenueRoot`. The `bountyBoard` and
///      `spinOutThresholdWei` immutables are pinned at deploy so v0.2 can
///      enforce the threshold without redeploying the token contract.
contract AgentVenture is ERC721URIStorage {
    IAgentRegistry public immutable agentRegistry;
    IBountyBoard public immutable bountyBoard;
    uint256 public immutable spinOutThresholdWei;

    /// @dev tokenId → wrapped agent namehash.
    mapping(uint256 => bytes32) private _agentNodeOf;
    /// @dev tokenId → caller-supplied commitment to the agent's settled-revenue
    ///      ledger (merkle root or similar). v0.1 stores it opaquely; v0.2 will
    ///      recompute it on-chain from BountyBoard receipts.
    mapping(uint256 => bytes32) private _accruedRevenueRootOf;

    uint256 private _nextTokenId = 1;

    error NotAgentOwner(bytes32 agentNode, address caller);
    error ZeroAddress();
    error UnknownToken(uint256 tokenId);

    /// @notice Emitted on every successful `mint`.
    /// @param tokenId             newly assigned ERC-721 token id (starts at 1)
    /// @param agentNode           AgentRegistry namehash being wrapped
    /// @param owner               token owner (== caller, == agent owner at mint time)
    /// @param accruedRevenueRoot  caller-supplied revenue commitment (see contract docs)
    /// @param swarmTokenURI       Swarm URI pinned as the token's metadata URI
    event AgentVentureMinted(
        uint256 indexed tokenId,
        bytes32 indexed agentNode,
        address indexed owner,
        bytes32 accruedRevenueRoot,
        string swarmTokenURI
    );

    constructor(
        IAgentRegistry agentRegistry_,
        IBountyBoard bountyBoard_,
        uint256 spinOutThresholdWei_
    ) ERC721("Kanbantic Agent Venture", "KAV") {
        if (address(agentRegistry_) == address(0)) {
            revert ZeroAddress();
        }
        if (address(bountyBoard_) == address(0)) revert ZeroAddress();
        agentRegistry = agentRegistry_;
        bountyBoard = bountyBoard_;
        spinOutThresholdWei = spinOutThresholdWei_;
    }

    /// @notice Mint an AgentVenture token wrapping `agentNode`.
    /// @dev Reverts if the caller is not the current AgentRegistry owner of
    ///      the agent. The `accruedRevenueRoot` and `swarmTokenURI` are stored
    ///      verbatim — see contract-level docs for the v0.2 hardening plan.
    /// @param agentNode           AgentRegistry namehash to wrap
    /// @param accruedRevenueRoot  caller-supplied revenue commitment
    /// @param swarmTokenURI       Swarm URI pinned as the token metadata URI
    /// @return tokenId            newly assigned ERC-721 id (starts at 1)
    function mint(bytes32 agentNode, bytes32 accruedRevenueRoot, string calldata swarmTokenURI)
        external
        returns (uint256 tokenId)
    {
        address agentOwner = agentRegistry.ownerOf(agentNode);
        if (agentOwner == address(0) || agentOwner != msg.sender) {
            revert NotAgentOwner(agentNode, msg.sender);
        }

        tokenId = _nextTokenId++;
        _agentNodeOf[tokenId] = agentNode;
        _accruedRevenueRootOf[tokenId] = accruedRevenueRoot;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, swarmTokenURI);

        emit AgentVentureMinted(tokenId, agentNode, msg.sender, accruedRevenueRoot, swarmTokenURI);
    }

    /// @notice Returns the AgentRegistry namehash wrapped by `tokenId`.
    function agentNodeOf(uint256 tokenId) external view returns (bytes32) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken(tokenId);
        return _agentNodeOf[tokenId];
    }

    /// @notice Returns the revenue commitment supplied at mint time.
    function accruedRevenueRootOf(uint256 tokenId) external view returns (bytes32) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken(tokenId);
        return _accruedRevenueRootOf[tokenId];
    }

    /// @notice Next tokenId that will be assigned by the next successful `mint`.
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }
}
