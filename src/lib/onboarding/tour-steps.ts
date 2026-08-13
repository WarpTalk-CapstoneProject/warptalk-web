/**
 * The guided walk through WarpTalk, as data.
 *
 * WHY THE STEPS ARE NOT INSIDE THE COMPONENT
 *   The one rule here that can be wrong is which steps a given person actually gets, and it is
 *   not a rendering question. Half of these targets do not exist for half of the people who
 *   will see this: a Member has no Billing, Knowledge or Dashboard in their sidebar, and the
 *   collapsed rail has no search box. A tour that walks someone to a highlight of nothing —
 *   an empty rectangle in the corner of the screen with a caption about billing — is worse
 *   than no tour, and it is the failure mode a tour is most likely to ship with, because the
 *   author is always an Owner on a wide screen.
 *
 *   So `visibleSteps` decides, from what is really in the DOM, and it is tested directly.
 *
 * TARGETS ARE `data-tour` ATTRIBUTES, NOT CSS SELECTORS
 *   A selector like `.sidebar > nav > a:nth-child(2)` is a promise about markup nobody making
 *   a layout change would know they were breaking. An attribute is a declaration that this
 *   element is the thing the tour means, and it moves with the element when it is refactored.
 */

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /**
   * The `data-tour` value of the element to spotlight, or null for a step that is about the
   * product rather than a control — the welcome and the closing note.
   */
  target: string | null;
  /** Preferred side for the card. The renderer flips it when there is no room. */
  placement?: "right" | "bottom" | "left" | "top";
}

export const TOUR_TARGET_ATTRIBUTE = "data-tour";

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to WarpTalk",
    body: "A meeting here is translated as it is spoken, in each person's own language and — if they have a voice profile — in something close to their own voice. This is a two-minute tour of where everything lives. You can leave at any point.",
    target: null,
  },
  {
    id: "meetings",
    title: "Meetings",
    body: "Every room this workspace runs — scheduled, live and finished. A finished one keeps its transcript and its AI summary on its own page.",
    target: "nav-meetings",
    placement: "right",
  },
  {
    id: "create-meeting",
    title: "Start one",
    body: "New meetings begin here. You choose which languages the room speaks, and everyone who joins picks the one they want to hear.",
    target: "nav-create-meeting",
    placement: "right",
  },
  {
    id: "voice-profiles",
    title: "Voice profiles",
    body: "Record a short sample once and your translated speech is spoken in your own voice instead of a stock one. Recording it is a consent step, and you can withdraw it here.",
    target: "nav-voice-profiles",
    placement: "right",
  },
  {
    id: "documents",
    title: "Documents",
    body: "Upload the contracts, specs and glossaries this workspace works from. An Owner or Admin approves each one before it becomes something the assistant can draw on.",
    target: "nav-documents",
    placement: "right",
  },
  {
    id: "knowledge",
    title: "Knowledge",
    body: "Everything the assistant has actually indexed, one row per piece, with the fact it extracted from each. Open a row to correct a fact, take it out of retrieval, or remove it.",
    target: "nav-knowledge",
    placement: "right",
  },
  {
    id: "members",
    title: "Members",
    body: "Who is in this workspace, who is waiting to join, and what each of them may do.",
    target: "nav-members",
    placement: "right",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    body: "How fast this workspace is spending its credits, what it is spending them on, and whether the balance reaches the renewal date.",
    target: "nav-dashboard",
    placement: "right",
  },
  {
    id: "warpbot",
    title: "Ask WarpBot",
    body: "Ask about anything this workspace has indexed — a clause in an uploaded contract, what was decided in a meeting last week — and it answers from that, not from the open internet.",
    target: "warpbot-launcher",
    placement: "top",
  },
  {
    id: "help",
    title: "That is the tour",
    body: "This button brings it back whenever you want it. Nothing here is a one-time offer.",
    target: "help-button",
    placement: "bottom",
  },
];

/**
 * The steps worth walking, given what is really on screen.
 *
 * A step with no target always survives — it is about the product, not about a control. A step
 * with one survives only if that control exists for this person, on this screen size, in this
 * role.
 */
export function visibleSteps(
  steps: TourStep[],
  isPresent: (target: string) => boolean,
): TourStep[] {
  return steps.filter((step) => step.target === null || isPresent(step.target));
}
