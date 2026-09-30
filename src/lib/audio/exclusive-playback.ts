/**
 * One voice clip at a time, across the whole page.
 *
 * WHY THIS EXISTS
 *     Every play button on Voice Profiles — a library voice, the stand-in voice, the dub voice,
 *     your original recording, the take in the Create dialog — made its own `new Audio()` and
 *     could only stop that one. Pressing play on a second row started a second clip on top of the
 *     first, and a third on top of both; the only way to silence them was to find each playing
 *     button again. Comparing voices, which is what the page is for, became impossible.
 *
 * WHY A CLAIM IS TAKEN BEFORE THE FETCH, NOT WHEN AUDIO STARTS
 *     A preview can take seconds to render. Press A, then B while A is still loading: if the slot
 *     were only taken on `play()`, A's response would land after B started and play over it. The
 *     claim is taken on the press, so pressing B supersedes A while A is still in flight, and A
 *     checks `isCurrent()` before it makes a sound.
 *
 * Module state on purpose: the slot belongs to the document, not to any component tree.
 */

export type PlaybackClaim = {
  /** Still the one allowed to play. False once anyone else has claimed the slot. */
  isCurrent: () => boolean;
  /** Give the slot back — on stop, on end, on unmount. A superseded claim releases nothing. */
  release: () => void;
};

let holder: { token: symbol; stop: () => void } | null = null;

/**
 * Take the page's single playback slot, stopping whoever held it.
 *
 * `stop` is what another claimant calls to silence this one: pause the element and return the
 * button to idle. It must not claim or release anything itself.
 */
export function claimPlayback(stop: () => void): PlaybackClaim {
  const previous = holder;
  const token = Symbol("playback");
  holder = { token, stop };
  // After the swap, so a `stop` that reads the slot already sees itself superseded.
  previous?.stop();

  return {
    isCurrent: () => holder?.token === token,
    release: () => {
      if (holder?.token === token) holder = null;
    },
  };
}
