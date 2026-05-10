/**
 * Wallet-side contract write helpers.
 *
 * Thin wrappers around wagmi v2's `useWriteContract` for the three
 * Sepolia contracts the public web app writes to: `AgentRegistry`
 * (register/update agents), `BountyBoard` (post/claim/settle bounties),
 * and `ReputationAttestor` (post-settlement review attestations). Each
 * method maps directly to the on-chain function.
 *
 * Function names mirror the ABI (and the .sol files) — `register`,
 * `update`, `transferOwner`, `setProfileRef` for AgentRegistry;
 * `post`, `claim`, `commitClaim`, `finalizeFairClaim`, `submit`,
 * `accept`, `reject` for BountyBoard; `attest` for ReputationAttestor.
 */

"use client";

import {
  sepoliaDeployment,
  AgentRegistryAbi,
  BountyBoardAbi,
  ReputationAttestorAbi,
  WorkspaceRegistryAbi,
} from "@kanbantic/shared";
import type { Address, Hex } from "viem";
import { useWriteContract } from "wagmi";

/**
 * Error shape exposed by `useWriteContract`. We re-derive it from the
 * hook return type rather than importing `@wagmi/core` directly so the
 * helper module has no extra dependency on the core package.
 */
type WriteContractError = ReturnType<typeof useWriteContract>["error"];

const AGENT_REGISTRY_ADDRESS: Address = sepoliaDeployment.contracts.AgentRegistry;
const BOUNTY_BOARD_ADDRESS: Address = sepoliaDeployment.contracts.BountyBoard;
const REPUTATION_ATTESTOR_ADDRESS: Address = sepoliaDeployment.contracts.ReputationAttestor;
const WORKSPACE_REGISTRY_ADDRESS: Address = sepoliaDeployment.contracts.WorkspaceRegistry;

/**
 * Empty bytes payload. Used for ABI-required `bytes` parameters that
 * Phase 1 contracts ignore on-chain (e.g., the `ownerSignature` arg on
 * `submit`, the `orbitportSig` arg on `finalizeFairClaim`).
 */
const EMPTY_BYTES: Hex = "0x";

export interface RegisterAgentArgs {
  parentNode: Hex;
  label: string;
  mcpEndpoint: string;
  capabilities: string;
}

export interface UpdateAgentArgs {
  node: Hex;
  mcpEndpoint: string;
  capabilities: string;
}

export interface TransferAgentArgs {
  node: Hex;
  newOwner: Address;
}

export interface SetProfileRefArgs {
  node: Hex;
  profileRef: Hex;
}

export interface UseAgentRegistryReturn {
  register: (args: RegisterAgentArgs) => void;
  update: (args: UpdateAgentArgs) => void;
  transferOwner: (args: TransferAgentArgs) => void;
  setProfileRef: (args: SetProfileRefArgs) => void;
  isPending: boolean;
  error: WriteContractError;
  hash: Hex | undefined;
  reset: () => void;
}

/**
 * `useAgentRegistry` — wraps `useWriteContract` against
 * `AgentRegistry` at `sepoliaDeployment.contracts.AgentRegistry`.
 *
 * The `register` helper expects a `parentNode` namehash; for the
 * public namespace pass `sepoliaDeployment.ens.rootNamehash`. The
 * contract derives the agent's leaf node as
 * `keccak256(parentNode, keccak256(label))` (see
 * `AgentRegistry._nodeFor`).
 */
export function useAgentRegistry(): UseAgentRegistryReturn {
  const { writeContract, data, isPending, error, reset } = useWriteContract();

  return {
    register: ({ parentNode, label, mcpEndpoint, capabilities }) => {
      writeContract({
        abi: AgentRegistryAbi,
        address: AGENT_REGISTRY_ADDRESS,
        functionName: "register",
        args: [parentNode, label, mcpEndpoint, capabilities],
      });
    },
    update: ({ node, mcpEndpoint, capabilities }) => {
      writeContract({
        abi: AgentRegistryAbi,
        address: AGENT_REGISTRY_ADDRESS,
        functionName: "update",
        args: [node, mcpEndpoint, capabilities],
      });
    },
    transferOwner: ({ node, newOwner }) => {
      writeContract({
        abi: AgentRegistryAbi,
        address: AGENT_REGISTRY_ADDRESS,
        functionName: "transferOwner",
        args: [node, newOwner],
      });
    },
    setProfileRef: ({ node, profileRef }) => {
      writeContract({
        abi: AgentRegistryAbi,
        address: AGENT_REGISTRY_ADDRESS,
        functionName: "setProfileRef",
        args: [node, profileRef],
      });
    },
    isPending,
    error,
    hash: data,
    reset,
  };
}

export interface PostBountyArgs {
  capabilityFilter: string;
  reward: bigint;
  descriptionRef: Hex;
  expiresAt: bigint;
  claimWindowBlocks: number;
  workspaceNode: Hex;
  arbiterCouncil: Address;
}

export interface ClaimBountyArgs {
  bountyId: bigint;
  agentNode: Hex;
}

export interface CommitClaimArgs {
  bountyId: bigint;
  commitment: Hex;
}

export interface FinalizeFairClaimArgs {
  bountyId: bigint;
  ctrngDraw: Hex;
  orbitportSig?: Hex;
}

export interface SubmitProofArgs {
  bountyId: bigint;
  proofRef: Hex;
  ownerSignature?: Hex;
}

export interface AcceptArgs {
  bountyId: bigint;
}

export interface RejectArgs {
  bountyId: bigint;
  reasonRef: Hex;
}

export interface UseBountyBoardReturn {
  post: (args: PostBountyArgs) => void;
  claim: (args: ClaimBountyArgs) => void;
  commitClaim: (args: CommitClaimArgs) => void;
  finalizeFairClaim: (args: FinalizeFairClaimArgs) => void;
  submit: (args: SubmitProofArgs) => void;
  accept: (args: AcceptArgs) => void;
  reject: (args: RejectArgs) => void;
  isPending: boolean;
  error: WriteContractError;
  hash: Hex | undefined;
  reset: () => void;
}

/**
 * `useBountyBoard` — wraps `useWriteContract` against `BountyBoard`
 * at `sepoliaDeployment.contracts.BountyBoard`.
 *
 * `post` is payable: the caller passes `reward` (wei) which is also
 * forwarded as `value` so `msg.value === reward` (the contract reverts
 * with `RewardValueMismatch` otherwise). Use viem's `parseEther` to
 * convert from human-readable ETH.
 */
export function useBountyBoard(): UseBountyBoardReturn {
  const { writeContract, data, isPending, error, reset } = useWriteContract();

  return {
    post: ({
      capabilityFilter,
      reward,
      descriptionRef,
      expiresAt,
      claimWindowBlocks,
      workspaceNode,
      arbiterCouncil,
    }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "post",
        args: [
          capabilityFilter,
          reward,
          descriptionRef,
          expiresAt,
          claimWindowBlocks,
          workspaceNode,
          arbiterCouncil,
        ],
        value: reward,
      });
    },
    claim: ({ bountyId, agentNode }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "claim",
        args: [bountyId, agentNode],
      });
    },
    commitClaim: ({ bountyId, commitment }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "commitClaim",
        args: [bountyId, commitment],
      });
    },
    finalizeFairClaim: ({ bountyId, ctrngDraw, orbitportSig = EMPTY_BYTES }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "finalizeFairClaim",
        args: [bountyId, ctrngDraw, orbitportSig],
      });
    },
    submit: ({ bountyId, proofRef, ownerSignature = EMPTY_BYTES }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "submit",
        args: [bountyId, proofRef, ownerSignature],
      });
    },
    accept: ({ bountyId }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "accept",
        args: [bountyId],
      });
    },
    reject: ({ bountyId, reasonRef }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "reject",
        args: [bountyId, reasonRef],
      });
    },
    isPending,
    error,
    hash: data,
    reset,
  };
}

export interface AttestArgs {
  bountyId: bigint;
  agentNode: Hex;
  /** 1-5 inclusive — contract reverts with `InvalidScore` otherwise. */
  score: number;
  /** 32-byte hash of the review comment, or `0x0…0` for none. */
  commentRef: Hex;
}

export interface UseReputationAttestorReturn {
  attest: (args: AttestArgs) => void;
  isPending: boolean;
  error: WriteContractError;
  hash: Hex | undefined;
  reset: () => void;
}

/**
 * `useReputationAttestor` — wraps `useWriteContract` against
 * `ReputationAttestor` at
 * `sepoliaDeployment.contracts.ReputationAttestor`.
 *
 * The contract's `attest(uint256 bountyId, bytes32 agentNode, uint8
 * score, bytes32 commentRef)` is a plain `external` function (no
 * EIP-712 signature) — it trusts `msg.sender == bountyBoard.posterOf
 * (bountyId)` for authorization. The reviewer is the bounty's poster
 * itself; no extra owner signature needs to be provided.
 *
 * Caller flow on the `/work/[id]` UI: poster opens the attestation
 * modal, picks a score (1-5) and an optional comment (hashed into
 * `commentRef`), submits `attest`, then submits `accept` on
 * `BountyBoard` — two separate wallet confirmations.
 */
export function useReputationAttestor(): UseReputationAttestorReturn {
  const { writeContract, data, isPending, error, reset } = useWriteContract();

  return {
    attest: ({ bountyId, agentNode, score, commentRef }) => {
      writeContract({
        abi: ReputationAttestorAbi,
        address: REPUTATION_ATTESTOR_ADDRESS,
        functionName: "attest",
        args: [bountyId, agentNode, score, commentRef],
      });
    },
    isPending,
    error,
    hash: data,
    reset,
  };
}

export interface CreateWorkspaceArgs {
  /**
   * Pre-computed namehash of the workspace's full ENS name (e.g.
   * `namehash("alpha.kanbantic.eth")`). The contract stores this as
   * `wsNode` *and* `parentNode` — see the v1 caveat in
   * `WorkspaceRegistry.sol`. The label-keccak parent-keccak split
   * happens off-chain in the UI.
   */
  parentNode: Hex;
  /** Initial member set — `msg.sender` is added implicitly as admin. */
  initialMembers: readonly Address[];
}

export interface AddWorkspaceMemberArgs {
  wsNode: Hex;
  member: Address;
}

export interface RemoveWorkspaceMemberArgs {
  wsNode: Hex;
  member: Address;
}

export interface TransferWorkspaceAdminArgs {
  wsNode: Hex;
  newAdmin: Address;
}

export interface UseWorkspaceRegistryReturn {
  create: (args: CreateWorkspaceArgs) => void;
  addMember: (args: AddWorkspaceMemberArgs) => void;
  removeMember: (args: RemoveWorkspaceMemberArgs) => void;
  transferAdmin: (args: TransferWorkspaceAdminArgs) => void;
  isPending: boolean;
  error: WriteContractError;
  hash: Hex | undefined;
  reset: () => void;
}

/**
 * `useWorkspaceRegistry` — wraps `useWriteContract` against
 * `WorkspaceRegistry` at
 * `sepoliaDeployment.contracts.WorkspaceRegistry`.
 *
 * Function names mirror the .sol exactly: `createWorkspace`,
 * `addMember`, `removeMember`, `transferAdmin`. The exposed JS
 * names drop the `Workspace` prefix on `create` for ergonomics
 * (`useWorkspaceRegistry().create(...)`).
 *
 * Caller-side responsibility: compute the workspace namehash via
 * viem's `namehash(<label>.<rootName>)` before calling `create`. The
 * contract stores `wsNode = parentNode`, so the value passed in is
 * also the key future calls (`addMember`, etc.) will use.
 */
export function useWorkspaceRegistry(): UseWorkspaceRegistryReturn {
  const { writeContract, data, isPending, error, reset } = useWriteContract();

  return {
    create: ({ parentNode, initialMembers }) => {
      writeContract({
        abi: WorkspaceRegistryAbi,
        address: WORKSPACE_REGISTRY_ADDRESS,
        functionName: "createWorkspace",
        args: [parentNode, initialMembers],
      });
    },
    addMember: ({ wsNode, member }) => {
      writeContract({
        abi: WorkspaceRegistryAbi,
        address: WORKSPACE_REGISTRY_ADDRESS,
        functionName: "addMember",
        args: [wsNode, member],
      });
    },
    removeMember: ({ wsNode, member }) => {
      writeContract({
        abi: WorkspaceRegistryAbi,
        address: WORKSPACE_REGISTRY_ADDRESS,
        functionName: "removeMember",
        args: [wsNode, member],
      });
    },
    transferAdmin: ({ wsNode, newAdmin }) => {
      writeContract({
        abi: WorkspaceRegistryAbi,
        address: WORKSPACE_REGISTRY_ADDRESS,
        functionName: "transferAdmin",
        args: [wsNode, newAdmin],
      });
    },
    isPending,
    error,
    hash: data,
    reset,
  };
}
