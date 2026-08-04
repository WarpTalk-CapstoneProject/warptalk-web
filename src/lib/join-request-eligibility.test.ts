import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAllowedFinalMembershipTypes,
  getDefaultApprovalMembershipType,
  getJoinRequestPolicyMessage,
  getSuggestedActionLabel,
  isJoinRequestApprovalBlocked,
  JOIN_REQUEST_SUGGESTED_ACTIONS,
} from "./join-request-eligibility.ts";
import type { WorkspaceInvitationDto } from "@/types/workspace";

const baseRequest: WorkspaceInvitationDto = {
  id: "invite-1",
  workspaceId: "workspace-1",
  email: "user@example.com",
  roleName: "Member",
  status: "REQUESTED",
  membershipType: "External",
  deliveryStatus: "Pending",
  sentCount: 0,
  expiresAt: "2026-08-04T00:00:00Z",
  createdAt: "2026-08-04T00:00:00Z",
};

describe("join request eligibility helpers", () => {
  it("falls back to the provisional membership type when the backend contract is not present", () => {
    assert.deepEqual(getAllowedFinalMembershipTypes(baseRequest), ["External"]);
    assert.equal(getDefaultApprovalMembershipType(baseRequest), "External");
    assert.equal(isJoinRequestApprovalBlocked(baseRequest), false);
  });

  it("blocks approval when backend returns no allowed final membership types", () => {
    const request = {
      ...baseRequest,
      allowedFinalMembershipTypes: [],
      requiresPolicyAction: true,
      policyReason: "Requester email does not match a verified workspace domain.",
    };

    assert.deepEqual(getAllowedFinalMembershipTypes(request), []);
    assert.equal(getDefaultApprovalMembershipType(request), undefined);
    assert.equal(isJoinRequestApprovalBlocked(request), true);
    assert.equal(getJoinRequestPolicyMessage(request), "Requester email does not match a verified workspace domain.");
  });

  it("ignores unknown suggested actions", () => {
    assert.equal(getSuggestedActionLabel(JOIN_REQUEST_SUGGESTED_ACTIONS.addVerifiedDomain), "Add verified domain");
    assert.equal(getSuggestedActionLabel("OpenPortal"), null);
  });
});
