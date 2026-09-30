import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildEntitlementSections,
  describeSource,
  formatEntitlementValue,
} from "../entitlements.ts";

test("capabilities read as Included / Not included", () => {
  assert.equal(formatEntitlementValue("voice_clone", "flag", "true").text, "Included");
  assert.equal(formatEntitlementValue("voice_clone", "flag", "false").text, "Not included");
});

test("limits carry their unit, singular when one, and 0 or less is Unlimited", () => {
  assert.equal(formatEntitlementValue("max_languages", "limit", "10").text, "10 languages");
  assert.equal(formatEntitlementValue("max_active_rooms", "limit", "1").text, "1 meeting");
  assert.equal(formatEntitlementValue("max_participants", "limit", "1000").text, "1,000 participants");
  assert.equal(formatEntitlementValue("max_participants", "limit", "0").state, "unlimited");
  assert.equal(formatEntitlementValue("max_participants", "limit", "-1").text, "Unlimited");
  assert.equal(formatEntitlementValue("future_limit", "limit", "7").text, "7");
});

test("every published source maps to one of the four chips", () => {
  assert.equal(describeSource("plan:enterprise").label, "Plan");
  assert.match(describeSource("plan:enterprise").detail, /Enterprise/);
  assert.equal(describeSource("contract_override").label, "Contract");
  assert.equal(describeSource("platform_default").label, "Platform default");
  assert.equal(describeSource("workspace_override").label, "Workspace limit");
});

test("an owner's limit shows its ceiling when the snapshot carries one, and admits it when not", () => {
  const sections = buildEntitlementSections([
    { key: "voice_clone", kind: "flag", value: "true", source: "plan:pro", ceiling: null, ceilingSource: null },
    {
      key: "max_active_rooms",
      kind: "limit",
      value: "5",
      source: "workspace_override",
      ceiling: "20",
      ceilingSource: "plan:pro",
    },
    { key: "max_languages", kind: "limit", value: "2", source: "workspace_override", ceiling: null, ceilingSource: null },
    { key: "new_capability", kind: "flag", value: "false", source: "platform_default", ceiling: null, ceilingSource: null },
  ]);

  assert.deepEqual(sections.map((s) => s.group), ["Meetings", "AI and voice", "Other"]);

  const meetings = sections[0].rows;
  assert.deepEqual(meetings.map((r) => r.key), ["max_active_rooms", "max_languages"]);
  assert.equal(meetings[0].value.text, "5 meetings");
  assert.equal(meetings[0].ceiling?.value.text, "20 meetings");
  assert.equal(meetings[0].ceiling?.source.label, "Plan");
  assert.equal(meetings[0].ceilingUnknown, false);
  assert.equal(meetings[1].ceiling, null);
  assert.equal(meetings[1].ceilingUnknown, true);

  // A key billing adds before the web names it still renders, readably.
  assert.equal(sections[2].rows[0].label, "New capability");
});

test("the Features page is read-only, links to Billing, and never invents defaults on cold start", () => {
  const source = readFileSync(
    new URL("../../../app/(app)/[workspaceSlug]/settings/features/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /useWorkspaceEntitlements/);
  assert.match(source, /settings\/billing/);
  assert.match(source, /isKnown/);
  assert.doesNotMatch(source, /useMutation|usePatchWorkspaceSettings|<Switch|<Input/);
  assert.doesNotMatch(source, /ENTITLEMENT_CATALOG/);
});

test("the settings sidebar offers Features in both render paths", () => {
  const sidebar = readFileSync(new URL("../../../components/layout/linear-sidebar.tsx", import.meta.url), "utf8");
  const hrefs = sidebar.match(/settings\/features/g) ?? [];
  assert.ok(hrefs.length >= 3, `expected the collapsed item and the expanded row, found ${hrefs.length}`);
});
