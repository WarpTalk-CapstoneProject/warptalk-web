/**
 * Who the big tile shows, and why it does not move every time somebody says "mm".
 *
 * The stage followed LiveKit's ActiveSpeakersChanged directly. That is right for the ring
 * around a tile — a light that tracks the voice — and wrong for the layout: a one-word
 * acknowledgement swapped the large tile, then swapped it back, so a two-person conversation
 * spent the whole meeting flickering between two faces. The owner's word for it was that it
 * gave them a headache, and they are right; it is the single most distracting thing on screen.
 *
 * So the focus is sticky. It stays where it is while its holder is still talking, and only
 * moves once somebody else has held the floor continuously for `holdMs` — long enough to be a
 * turn rather than a noise. Everything here is a pure function of (state, speakers, now), so
 * the timing rules can be tested without a meeting.
 */

export type StickySpeakerState = {
  /** Who the layout is currently built around. */
  focused: string | null;
  /** Who is trying to take the floor, and since when. */
  candidate: string | null;
  candidateSince: number;
};

export const INITIAL_STICKY_SPEAKER: StickySpeakerState = {
  focused: null,
  candidate: null,
  candidateSince: 0,
};

/** Long enough that an "mm" or a laugh cannot take the stage; short enough to feel live. */
export const SPEAKER_HOLD_MS = 2000;

export function nextStickySpeaker(
  state: StickySpeakerState,
  speaking: readonly string[],
  now: number,
  holdMs: number = SPEAKER_HOLD_MS,
): StickySpeakerState {
  // Nobody is talking: hold the last speaker rather than falling back to whoever happens to
  // be first in the list. A silent room should not reshuffle itself.
  if (speaking.length === 0) {
    return state.candidate === null
      ? state
      : { ...state, candidate: null, candidateSince: 0 };
  }

  // The floor is still theirs. Any competing candidate is abandoned — they interrupted and
  // stopped, which is not a turn.
  if (state.focused !== null && speaking.includes(state.focused)) {
    return state.candidate === null
      ? state
      : { ...state, candidate: null, candidateSince: 0 };
  }

  // Nobody has the focus yet — the first person to speak takes it immediately, since there
  // is nothing to flicker away from.
  if (state.focused === null) {
    return { focused: speaking[0], candidate: null, candidateSince: 0 };
  }

  const contender = speaking[0];

  // A different person from last time starts their own clock.
  if (state.candidate !== contender) {
    return { ...state, candidate: contender, candidateSince: now };
  }

  // Same person, still going: hand over once they have held the floor long enough.
  if (now - state.candidateSince >= holdMs) {
    return { focused: contender, candidate: null, candidateSince: 0 };
  }

  return state;
}
