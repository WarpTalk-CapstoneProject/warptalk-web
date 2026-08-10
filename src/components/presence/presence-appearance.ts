import type { PresenceState } from "@/types/presence";

/**
 * How each presence state reads, kept out of the component so it can be tested.
 *
 * The node test runner strips types but cannot parse JSX, so anything imported by a test has
 * to live in a `.ts` file. `src/lib/room-code-guess.ts` exists for the same reason.
 */

export const PRESENCE_LABELS: Record<PresenceState, string> = {
  Online: "Online",
  InMeeting: "In a meeting",
  Offline: "Offline",
};

export const PRESENCE_DOT_CLASSES: Record<PresenceState, string> = {
  Online: "bg-emerald-500",
  // Red, not a ringed green. The original reasoning was that "in a meeting" is a kind of
  // online and that two greens are indistinguishable at 8px — the first half is true and the
  // second is exactly why the ring failed: at this size a 2px inset ring is a smudge, so
  // someone in a meeting looked available. Red carries the meaning every other product uses
  // for it (busy, do not disturb) and survives being small, which a shade never does.
  InMeeting: "bg-red-500",
  // Filled grey rather than a hollow outline. An empty circle reads as a placeholder — as
  // something still loading — which is precisely the state this is not: unresolved presence
  // renders nothing at all, so anything drawn here is a definite answer.
  Offline: "bg-ink-subtle/40",
};
