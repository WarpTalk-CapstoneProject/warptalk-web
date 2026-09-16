import assert from "node:assert/strict";
import test from "node:test";

import {
  describePluginActivityOutcome,
  hasNextPluginActivityPage,
  toPluginActivityRows,
} from "../plugin-activity.ts";

/**
 * WT-646 — the workspace plugin activity page resolves names and outcomes itself.
 *
 * The audit endpoint returns ids and codes. The cases worth pinning are the ones where a naive
 * lookup would lie: a member who left, a plugin retired from the catalog, and a refusal the
 * workspace's own policy produced being shown as a broken plugin.
 */

const ALICE = "019f0d00-0de0-7000-9000-000000000001";
const BOB = "019f0d00-0de0-7000-9000-000000000002";
const GHOST = "019f0d00-0de0-7000-9000-00000000dead";

const MEMBERS = [
  { userId: ALICE, fullName: "Alice Nguyen", email: "alice@example.com" },
  { userId: BOB, fullName: "", email: "bob@example.com" },
];

const PLUGINS = [
  {
    key: "google_drive",
    label: "Google Drive",
    tools: [{ name: "google_drive_search", label: "Search files" }],
  },
];

function audit(overrides: Partial<{ userId: string; pluginKey: string; toolName: string; resultStatus: string }>) {
  return {
    id: "a1",
    userId: ALICE,
    conversationId: null,
    pluginKey: "google_drive",
    toolName: "google_drive_search",
    resultStatus: "success",
    providerResourceRef: null,
    createdAt: "2026-09-16T08:00:00Z",
    ...overrides,
  };
}

test("members resolve to their name, then their email", () => {
  const [alice, bob] = toPluginActivityRows(
    [audit({ userId: ALICE }), audit({ userId: BOB })],
    MEMBERS,
    PLUGINS,
  );
  assert.equal(alice.memberLabel, "Alice Nguyen");
  assert.equal(alice.isFormerMember, false);
  assert.equal(bob.memberLabel, "bob@example.com");
});

test("a caller who has left the workspace keeps their row, labelled", () => {
  const [row] = toPluginActivityRows([audit({ userId: GHOST })], MEMBERS, PLUGINS);
  assert.equal(row.isFormerMember, true);
  assert.equal(row.memberLabel, "Former member");
});

test("plugin and tool labels come from the catalog, falling back to the raw keys", () => {
  const [known, retired] = toPluginActivityRows(
    [audit({}), audit({ pluginKey: "old_crm", toolName: "old_crm_lookup" })],
    MEMBERS,
    PLUGINS,
  );
  assert.equal(known.pluginLabel, "Google Drive");
  assert.equal(known.toolLabel, "Search files");
  assert.equal(retired.pluginLabel, "old_crm");
  assert.equal(retired.toolLabel, "old_crm_lookup");
});

test("a workspace-policy refusal reads as Blocked, not as a failure", () => {
  const outcome = describePluginActivityOutcome("permission_denied");
  assert.equal(outcome.label, "Blocked");
  assert.equal(outcome.tone, "blocked");
  assert.equal(outcome.code, "permission_denied");
});

test("success carries no code; setup gaps and unknown codes are told apart", () => {
  assert.deepEqual(describePluginActivityOutcome("success"), {
    label: "Succeeded",
    tone: "success",
    code: null,
  });
  assert.equal(describePluginActivityOutcome("connection_required").label, "Needs setup");
  assert.equal(describePluginActivityOutcome("confirmation_required").tone, "attention");
  assert.equal(describePluginActivityOutcome("provider_unavailable").label, "Provider error");
  const unknown = describePluginActivityOutcome("something_new");
  assert.equal(unknown.label, "Failed");
  assert.equal(unknown.code, "something_new");
});

test("only a full page suggests another one", () => {
  assert.equal(hasNextPluginActivityPage(50, 50), true);
  assert.equal(hasNextPluginActivityPage(49, 50), false);
  assert.equal(hasNextPluginActivityPage(0, 50), false);
});
