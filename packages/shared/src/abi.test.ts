import { describe, expect, it } from "vitest";

import {
  AgentRegistryAbi,
  ArbiterCouncilAbi,
  BountyBoardAbi,
  ReputationAttestorAbi,
  WorkspaceRegistryAbi,
} from "./abi/index.js";

function functionNames(abi: readonly unknown[]): string[] {
  return abi
    .filter((e): e is { type: string; name?: string } => typeof e === "object" && e !== null)
    .filter((e) => e.type === "function")
    .map((e) => e.name)
    .filter((n): n is string => typeof n === "string");
}

function eventNames(abi: readonly unknown[]): string[] {
  return abi
    .filter((e): e is { type: string; name?: string } => typeof e === "object" && e !== null)
    .filter((e) => e.type === "event")
    .map((e) => e.name)
    .filter((n): n is string => typeof n === "string");
}

describe("WorkspaceRegistryAbi", () => {
  it("contains createWorkspace, addMember, removeMember, transferAdmin", () => {
    const fns = functionNames(WorkspaceRegistryAbi);
    expect(fns).toContain("createWorkspace");
    expect(fns).toContain("addMember");
    expect(fns).toContain("removeMember");
    expect(fns).toContain("transferAdmin");
  });

  it("emits WorkspaceCreated, MemberAdded, MemberRemoved, AdminTransferred", () => {
    const events = eventNames(WorkspaceRegistryAbi);
    expect(events).toEqual(
      expect.arrayContaining([
        "WorkspaceCreated",
        "MemberAdded",
        "MemberRemoved",
        "AdminTransferred",
      ]),
    );
  });
});

describe("AgentRegistryAbi", () => {
  it("contains register, update, transferOwner, setProfileRef", () => {
    const fns = functionNames(AgentRegistryAbi);
    expect(fns).toContain("register");
    expect(fns).toContain("update");
    expect(fns).toContain("transferOwner");
    expect(fns).toContain("setProfileRef");
    expect(fns).toContain("nodeFor");
  });

  it("emits AgentRegistered, AgentUpdated, AgentTransferred, ProfileSet", () => {
    const events = eventNames(AgentRegistryAbi);
    expect(events).toEqual(
      expect.arrayContaining(["AgentRegistered", "AgentUpdated", "AgentTransferred", "ProfileSet"]),
    );
  });
});

describe("BountyBoardAbi", () => {
  it("contains the full lifecycle surface", () => {
    const fns = functionNames(BountyBoardAbi);
    for (const name of [
      "post",
      "claim",
      "commitClaim",
      "finalizeFairClaim",
      "revealClaim",
      "submit",
      "accept",
      "reject",
      "settleDispute",
      "expire",
    ]) {
      expect(fns).toContain(name);
    }
  });

  it("emits the 9 lifecycle events", () => {
    const events = eventNames(BountyBoardAbi);
    expect(events).toEqual(
      expect.arrayContaining([
        "BountyPosted",
        "BountyClaimCommitted",
        "BountyClaimFinalized",
        "BountyClaimed",
        "BountySubmitted",
        "BountyAccepted",
        "BountyRejected",
        "BountySettled",
        "BountyExpired",
      ]),
    );
  });
});

describe("ReputationAttestorAbi", () => {
  it("contains attest + hasAttested", () => {
    const fns = functionNames(ReputationAttestorAbi);
    expect(fns).toContain("attest");
    expect(fns).toContain("hasAttested");
  });

  it("emits Attested", () => {
    expect(eventNames(ReputationAttestorAbi)).toContain("Attested");
  });
});

describe("ArbiterCouncilAbi", () => {
  it("contains vote + execute", () => {
    const fns = functionNames(ArbiterCouncilAbi);
    expect(fns).toContain("vote");
    expect(fns).toContain("execute");
  });

  it("emits Voted + Executed", () => {
    const events = eventNames(ArbiterCouncilAbi);
    expect(events).toEqual(expect.arrayContaining(["Voted", "Executed"]));
  });
});
