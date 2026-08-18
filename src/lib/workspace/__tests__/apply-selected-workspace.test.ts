import assert from "node:assert/strict";
import test from "node:test";

import { applySelectedWorkspace } from "../apply-selected-workspace.ts";
import { useWorkspaceStore } from "../../../stores/workspace-store.ts";

test("applySelectedWorkspace hydrates the store from backend selection data", () => {
  useWorkspaceStore.getState().clearActiveWorkspace();

  applySelectedWorkspace(
    {
      selectedWorkspaceId: "ws-1",
      name: "Acme",
      slug: "acme",
      role: "Member",
      membershipType: "External",
      defaultLanguage: "vi",
    },
    useWorkspaceStore.getState().setActiveWorkspace,
  );

  const state = useWorkspaceStore.getState();
  assert.equal(state.activeWorkspaceId, "ws-1");
  assert.equal(state.activeWorkspaceSlug, "acme");
  assert.equal(state.role, "member");
  assert.equal(state.membershipType, "External");
  assert.equal(state.defaultLanguage, "vi");
});
