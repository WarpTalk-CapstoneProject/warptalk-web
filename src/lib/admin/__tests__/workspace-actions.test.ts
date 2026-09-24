import test from "node:test";
import assert from "node:assert/strict";

import {
  WORKSPACE_ACTIONS,
  buildEntitlementPatch,
  burnGeometry,
  compedPeriodEnd,
  draftFromEntitlements,
  exportFileName,
  extendedTrialEnd,
  marginTone,
  parseCompPeriods,
  parseCreditAmount,
  parseTrialDays,
  signOutAllTargets,
  timelineActionKey,
  transferCandidates,
  validateReason,
} from "../workspace-actions.ts";

test("every action the owner asked for is on the page's action set", () => {
  const ids = WORKSPACE_ACTIONS.map((a) => a.id);
  for (const required of [
    "adjustCredits",
    "changePlan",
    "extendTrial",
    "compPeriod",
    "entitlements",
    "markInvoicePaid",
    "transferOwnership",
    "signOutMember",
    "signOutAll",
    "sendNotice",
    "exportSummary",
    "suspend",
    "reactivate",
    "delete",
  ]) {
    assert.ok(ids.includes(required as never), `${required} is missing from WORKSPACE_ACTIONS`);
  }
  assert.equal(new Set(ids).size, ids.length, "an action is listed twice");
});

test("every action names a system-admin route, never a member-scoped one", () => {
  for (const action of WORKSPACE_ACTIONS) {
    assert.match(action.route, /^(GET|POST|PUT) \/admin\//, `${action.id} must go through an /admin route`);
  }
});

test("a reason is required, trimmed, and capped at 500", () => {
  assert.equal(validateReason(""), "reasonRequired");
  assert.equal(validateReason("   "), "reasonRequired");
  assert.equal(validateReason("x".repeat(501)), "reasonTooLong");
  assert.equal(validateReason(`  ${"x".repeat(500)}  `), null);
  assert.equal(validateReason("Outage compensation"), null);
});

test("a credit adjustment is a whole, non-zero number within ±1,000,000", () => {
  assert.deepEqual(parseCreditAmount("500"), { ok: true, value: 500 });
  assert.deepEqual(parseCreditAmount("-250"), { ok: true, value: -250 });
  for (const bad of ["", "0", "1.5", "abc", "Infinity", "NaN"]) {
    assert.deepEqual(parseCreditAmount(bad), { ok: false, error: "amountInvalid" }, bad);
  }
  assert.deepEqual(parseCreditAmount("1000001"), { ok: false, error: "amountTooLarge" });
  assert.deepEqual(parseCreditAmount("-1000001"), { ok: false, error: "amountTooLarge" });
});

test("trial days and comp periods have the server's bounds", () => {
  assert.deepEqual(parseTrialDays("14"), { ok: true, value: 14 });
  assert.equal(parseTrialDays("0").ok, false);
  assert.equal(parseTrialDays("91").ok, false);
  assert.deepEqual(parseCompPeriods("12"), { ok: true, value: 12 });
  assert.equal(parseCompPeriods("13").ok, false);
  assert.equal(parseCompPeriods("1.5").ok, false);
});

test("an extension of a lapsed trial counts from now; of a running one, from its end", () => {
  const now = new Date("2026-09-24T00:00:00Z");
  assert.equal(extendedTrialEnd("2026-09-20T00:00:00Z", 7, now).toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(extendedTrialEnd("2026-09-30T00:00:00Z", 7, now).toISOString(), "2026-10-07T00:00:00.000Z");
  assert.equal(compedPeriodEnd("2026-10-15T00:00:00Z", 2, now).toISOString(), "2026-12-15T00:00:00.000Z");
});

test("the entitlement PUT carries only what changed; clearing a field sends null", () => {
  const entitlements = [
    { key: "max_languages", contractOverride: null },
    { key: "voice_clone", contractOverride: "false" },
    { key: "glossary", contractOverride: "true" },
  ];
  const draft = { ...draftFromEntitlements(entitlements), max_languages: "8", voice_clone: "" };

  assert.deepEqual(buildEntitlementPatch(entitlements, draft), {
    ok: true,
    value: { max_languages: 8, voice_clone: null },
  });
  assert.deepEqual(buildEntitlementPatch(entitlements, draftFromEntitlements(entitlements)), {
    ok: false,
    error: "noChanges",
  });
  assert.deepEqual(buildEntitlementPatch(entitlements, { ...draft, max_languages: "-1" }), {
    ok: false,
    error: "limitInvalid",
  });
  assert.deepEqual(buildEntitlementPatch(entitlements, { ...draft, glossary: "yes" }), {
    ok: false,
    error: "limitInvalid",
  });
});

test("the burn chart carries the balance over a day with no ledger rows", () => {
  const geometry = burnGeometry(
    [
      { date: "2026-09-01", consumed: 100, granted: 0, balanceAfter: 900 },
      { date: "2026-09-02", consumed: 0, granted: 0, balanceAfter: null },
      { date: "2026-09-03", consumed: 50, granted: 500, balanceAfter: 1350 },
    ],
    300,
    100,
  );

  assert.equal(geometry.bars.length, 3);
  assert.equal(geometry.bars[0]!.height, 100);
  assert.equal(geometry.bars[1]!.height, 0);
  assert.deepEqual(geometry.line.map((p) => p.balance), [900, 900, 1350]);
  assert.equal(geometry.maxBalance, 1350);
});

test("the burn chart draws no line before the first known balance", () => {
  const geometry = burnGeometry(
    [
      { date: "2026-09-01", consumed: 0, granted: 0, balanceAfter: null },
      { date: "2026-09-02", consumed: 10, granted: 0, balanceAfter: 90 },
    ],
    200,
    100,
  );
  assert.deepEqual(geometry.line.map((p) => p.balance), [90]);
});

test("the P&L tile never reads an unknown margin as break-even", () => {
  assert.equal(marginTone({ amount: null }), "unknown");
  assert.equal(marginTone({ amount: 0 }), "profit");
  assert.equal(marginTone({ amount: -1 }), "loss");
});

test("sign-out-all names every listed member once; ownership goes only to internal non-owners", () => {
  const members = [
    { userId: "a", role: "Owner", membershipType: "Internal" },
    { userId: "b", role: "Admin", membershipType: "Internal" },
    { userId: "c", role: "Member", membershipType: "External" },
    { userId: "b", role: "Admin", membershipType: "Internal" },
  ];
  assert.deepEqual(signOutAllTargets(members), ["a", "b", "c"]);
  assert.deepEqual(transferCandidates(members).map((m) => m.userId), ["b", "b"]);
});

test("the export file is named for the workspace and the UTC day", () => {
  assert.equal(
    exportFileName("Acme Localization", new Date("2026-09-24T18:00:00Z")),
    "acme-localization-workspace-summary-2026-09-24.json",
  );
  assert.equal(exportFileName("", new Date("2026-09-24T00:00:00Z")), "workspace-workspace-summary-2026-09-24.json");
});

test("every audit verb the page's actions write has its own timeline label", () => {
  for (const verb of [
    "credit.adjusted",
    "subscription.plan_changed",
    "subscription.trial_extended",
    "subscription.period_comped",
    "entitlements.overridden",
    "invoice.marked_paid",
    "ownership.transferred",
    "notice.sent",
    "note.added",
    "data.exported",
    "user.sessions_revoked",
    "suspend",
    "reactivate",
    "delete",
  ]) {
    assert.notEqual(timelineActionKey(verb), "other", verb);
  }
  assert.equal(timelineActionKey("language.enabled"), "other");
});
