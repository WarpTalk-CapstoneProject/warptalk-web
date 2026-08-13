// A tour that walks you to a highlight of nothing is worse than no tour.
//
// Half of these targets do not exist for half of the people who will see this: a Member has no
// Billing, Knowledge or Dashboard in their sidebar. The author of a tour is always an Owner on a
// wide screen, which is exactly why this is decided from the real DOM and pinned here rather
// than left to whoever writes the steps to remember.

import assert from "node:assert/strict";
import test from "node:test";

import { TOUR_STEPS, visibleSteps, type TourStep } from "../tour-steps.ts";

function present(...targets: string[]) {
  const set = new Set(targets);
  return (target: string) => set.has(target);
}

test("a step whose control is missing is dropped", () => {
  const steps: TourStep[] = [
    { id: "a", title: "A", body: "", target: "nav-members" },
    { id: "b", title: "B", body: "", target: "nav-billing" },
  ];

  assert.deepEqual(
    visibleSteps(steps, present("nav-members")).map((step) => step.id),
    ["a"],
  );
});

test("a step about the product rather than a control always survives", () => {
  // The welcome and the closing note have nothing to point at, and dropping them would leave
  // a tour that opens mid-sentence on a sidebar item.
  const steps: TourStep[] = [
    { id: "welcome", title: "", body: "", target: null },
    { id: "gone", title: "", body: "", target: "nav-nothing" },
  ];

  assert.deepEqual(
    visibleSteps(steps, present()).map((step) => step.id),
    ["welcome"],
  );
});

test("order is preserved", () => {
  const steps: TourStep[] = [
    { id: "1", title: "", body: "", target: "a" },
    { id: "2", title: "", body: "", target: "missing" },
    { id: "3", title: "", body: "", target: "c" },
  ];

  assert.deepEqual(
    visibleSteps(steps, present("a", "c")).map((step) => step.id),
    ["1", "3"],
  );
});

test("a Member sees a shorter tour, and it still starts and ends properly", () => {
  // The real shape of the problem: an ordinary member's sidebar has Meetings, Voice Profiles,
  // Documents and Members, and none of the Owner-only destinations.
  const memberTour = visibleSteps(
    TOUR_STEPS,
    present(
      "nav-meetings",
      "nav-create-meeting",
      "nav-voice-profiles",
      "nav-documents",
      "nav-members",
      "warpbot-launcher",
      "help-button",
    ),
  );

  const ids = memberTour.map((step) => step.id);
  assert.ok(!ids.includes("knowledge"), "a Member has no Knowledge page to be shown");
  assert.ok(!ids.includes("dashboard"), "a Member has no Dashboard to be shown");
  assert.equal(ids[0], "welcome");
  assert.equal(ids[ids.length - 1], "help");
});

test("nothing on screen still leaves the steps that need nothing", () => {
  // The pathological case — a narrow window with the sidebar collapsed away. The tour must
  // degrade to its own introduction rather than to an empty array the renderer has to
  // special-case.
  const survivors = visibleSteps(TOUR_STEPS, present());
  assert.ok(survivors.length > 0);
  assert.ok(survivors.every((step) => step.target === null));
});

test("every shipped step has something to say", () => {
  for (const step of TOUR_STEPS) {
    assert.ok(step.title.trim().length > 0, `${step.id} has no title`);
    assert.ok(step.body.trim().length > 0, `${step.id} has no body`);
  }
  assert.equal(
    new Set(TOUR_STEPS.map((step) => step.id)).size,
    TOUR_STEPS.length,
    "duplicate step ids — the renderer keys on them",
  );
});
