/**
 * The half-duplex gate's memory of which tracks it has silenced, so that every one of them is
 * given back.
 *
 * WHY THE GATE NEEDS THIS
 *   HalfDuplexMic (components/rooms/live/half-duplex-mic.tsx) silences the microphone while a dub
 *   plays by setting `enabled = false` on a MediaStreamTrack. It used to remember only THAT it had
 *   done so (one boolean), and on release it looked the track up again and re-enabled whatever it
 *   found — and only if the user was not muted at that moment. Two things are wrong with that, and
 *   both end in a microphone that is silent until the page is reloaded:
 *
 *   - "Whatever it found" is not necessarily what it disabled. The published track is the noise
 *     filter's OUTPUT while a filter is attached and the raw capture otherwise, and it is replaced
 *     when the filter attaches or detaches, when the device is switched, and when the track is
 *     restarted. A track disabled before such a swap was never looked at again.
 *   - "Only if the user is not muted" skipped the release altogether. The user's mute lives on the
 *     raw capture track; with a noise filter attached the gate had disabled the filter's output,
 *     which LiveKit's unmute never touches. Mute during a dub, let the gate period end, unmute:
 *     the raw track comes back, the published track stays disabled, and nothing holds a reference
 *     to it any more.
 *
 * THE RULE
 *   The gate re-enables exactly the objects it disabled, and nothing else. A track it finds
 *   already disabled is somebody else's (the user's own mute) and is never recorded, so it is
 *   never re-enabled from here.
 *
 * THE ONE EXCEPTION, AND WHY IT IS NOT A STUCK MICROPHONE
 *   A track the gate disabled can afterwards come to be held down by its real owner as well: with
 *   no noise filter, the gated track IS the raw capture, and a user who mutes during a dub now
 *   holds that same flag down. Re-enabling it on release would un-mute them — into the room, and
 *   into whatever else plays that track (the bridge's outbound leg plays it into Google Meet).
 *   `ownedElsewhere` says when that is the case; such a track is dropped from the books and left
 *   as it is. That is safe precisely because its owner will lift it: the predicate must only be
 *   true for a track that something else is guaranteed to re-enable (or that is already dead).
 *
 * Pure — works on anything with an `enabled` flag — so it can be tested without a browser, a
 * MediaStreamTrack, or a room.
 */

/** The only part of a MediaStreamTrack the gate touches. */
export type GateableTrack = { enabled: boolean };

export class MicGate<T extends GateableTrack = GateableTrack> {
  /** Every track this gate has disabled and not yet given back. Compared by identity. */
  private readonly held = new Set<T>();
  private readonly ownedElsewhere: (track: T) => boolean;

  /**
   * @param ownedElsewhere True for a held track whose `enabled` flag now belongs to somebody who
   *   will restore it themselves — see "THE ONE EXCEPTION". Defaults to never.
   */
  constructor(ownedElsewhere: (track: T) => boolean = () => false) {
    this.ownedElsewhere = ownedElsewhere;
  }

  /** True while at least one track is disabled on this gate's account. */
  get holding(): boolean {
    return this.held.size > 0;
  }

  /** Whether `track` is one this gate disabled and has not yet given back. */
  holds(track: T): boolean {
    return this.held.has(track);
  }

  /**
   * The gate is shut and `current` is the track carrying the microphone right now (null when
   * there is none). Call it every time the gate is asserted, not only when it first shuts.
   *
   * First gives back every held track that is NOT `current`: the microphone has moved to a
   * different object, and the old one must not be left disabled behind it.
   *
   * Returns true when the caller must now set `current.enabled = false`; the track is recorded
   * as held before returning. That is the case when `current` is live — including a track this
   * gate already holds that something has re-enabled underneath it (the user unmuting inside a
   * gate period). Returns false, recording nothing, when there is no track or it is already
   * disabled: either this gate did that and still holds it, or somebody else did and it is
   * theirs.
   */
  claim(current: T | null | undefined): boolean {
    for (const track of this.held) {
      if (track !== current) this.giveBack(track);
    }
    if (!current || !current.enabled) return false;
    this.held.add(current);
    return true;
  }

  /** The gate opens: every track it disabled is re-enabled. Safe to call any number of times. */
  release(): void {
    for (const track of this.held) this.giveBack(track);
  }

  private giveBack(track: T): void {
    this.held.delete(track);
    if (!this.ownedElsewhere(track)) track.enabled = true;
  }
}
