"use client";

/**
 * The wire between the transcript and the summary rail.
 *
 * WHY A CONTEXT AND NOT PROPS
 *   The transcript arrives at the record section as an already-built `ReactNode`: the room page
 *   constructs `<MeetingTranscriptArtifact>` with a dozen props of its own — the segments, the
 *   translations, the correction permissions — and hands the finished element down. That is
 *   deliberate (it is the one tab that is live DURING a meeting, so its data belongs to the page),
 *   and it means the section CANNOT reach in and add two more props to it. A context can, because
 *   the transcript is rendered as a child of the layout that provides it.
 *
 * WHAT TRAVELS, AND IN WHICH DIRECTION
 *   Up, from the transcript:  the blocks it laid out (`anchors`), and which one the reader's eye
 *                             is on (`readingKey`).
 *   Down, from the rail:      which blocks a summary claim is pointing at right now (`markedKeys`)
 *                             — a sentence that summarises an exchange rests on more than one turn,
 *                             and marking only the first would leave the reply unlit.
 *   Down, from the player:    where the recording's playhead is (`playingMs`) and whether it is
 *                             moving (`isPlaying`) — see THE PLAYHEAD below.
 *   Sideways, once:           a navigator and a playback toggle, registered by whoever owns the
 *                             DOM for them, so the keymap can live in ONE place instead of being
 *                             re-implemented by every surface that has a key to handle.
 *
 *   Nothing here knows about milliseconds except through document-reading.ts. The rail resolves a
 *   citation's moment to a block key and publishes the key; the transcript compares keys. That is
 *   what stops the "which paragraph does this claim cover" rule existing in two places and drifting
 *   — it was the single most likely way for this feature to end up quietly off by one turn.
 *
 * THE PLAYHEAD, AND WHY ITS CONVERSION HAPPENS IN HERE
 *   The player publishes `video.currentTime` and nothing else. That number is on the FILE axis; the
 *   transcript's offsets are on the meeting axis, and the gap between the two origins is different
 *   for every meeting (recording-seek.ts opens with why). Converting inside the provider means
 *   there is exactly one place where the two clocks meet in this direction, mirroring the one place
 *   they meet in the other — `requestSeek` on the room page. The player stays a media element with
 *   a couple of callbacks and knows nothing about meetings; the transcript receives a meeting
 *   moment and resolves it through the same `anchorForMs` the rail uses.
 *
 *   Following is state here rather than in the transcript panel because both sides need it: the
 *   panel scrolls with it, and the pill that turns it back on may only appear while the recording
 *   is actually playing — a fact only the player knows.
 *
 * OPTIONAL BY DESIGN
 *   `useReadingSync()` returns null outside a provider, and every consumer degrades to its
 *   pre-Option-C behaviour when it does. /dev/transcript-preview renders the transcript with no
 *   rail at all, and a transcript that threw without one would take that page down with it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  meetingMsFromRecordingSeconds,
  type SeekSources,
} from "@/lib/meeting/recording-seek";
import {
  anchorForMs,
  anchorsEqual,
  readingShortcut,
  type ReadingAnchor,
} from "@/lib/transcript/document-reading";

/**
 * How often the playhead is allowed to move the highlight: about 4 Hz.
 *
 * `timeupdate` already fires at roughly this rate in most browsers, so this is a floor rather than
 * a reduction — but the rate is explicitly NOT specified by the HTML standard, and a browser that
 * fires it on every frame would re-render the transcript column sixty times a second while somebody
 * reads it. A highlight that lands a quarter of a second late is not something a reader can see; a
 * reading surface that drops frames is.
 */
const PLAYHEAD_INTERVAL_MS = 240;

/** What J, K and `/` drive. Registered by the surface that owns the scroll container. */
export type ReadingNavigator = {
  /** Move the reading position by whole speaker turns. Negative goes back up the meeting. */
  step: (delta: number) => void;
  /** Open the transcript's find field and put the cursor in it. */
  focusSearch: () => void;
};

export type ReadingSync = {
  /** The document as the reading column laid it out, in document order. */
  anchors: readonly ReadingAnchor[];
  publishAnchors: (next: readonly ReadingAnchor[]) => void;
  /** The block under the reader's eye, or null before the first measurement. */
  readingKey: string | null;
  setReadingKey: (key: string | null) => void;
  /** The blocks a rail item is pointing at while it is hovered or focused. */
  markedKeys: readonly string[];
  setMarkedKeys: (keys: readonly string[]) => void;
  registerNavigator: (navigator: ReadingNavigator | null) => void;
  /** A press of Space, as a token — see the same pattern on SeekRequest. */
  playbackRequest: { token: number } | null;
  /**
   * Where the recording's playhead is, in FILE seconds — `video.currentTime` verbatim.
   *
   * Called from the player's `timeupdate`, which fires about four times a second. Null when there
   * is no playhead to speak of (no recording loaded, or the element was torn down), which retracts
   * the highlight rather than leaving it standing on a line nothing is playing.
   */
  publishPlaybackSeconds: (seconds: number | null) => void;
  /** The same instant on the MEETING axis, or null when the two clocks cannot be reconciled. */
  /**
   * The block the recording is playing, or null.
   *
   * A KEY AND NOT A MILLISECOND, DELIBERATELY. The playhead arrives about four times a second, and
   * this context value's identity is what every consumer re-renders on — publishing the raw moment
   * meant the whole transcript column re-rendered at 4 Hz to change one line's colour, and the
   * column is six hundred rows on a long meeting. Resolved here instead, the value changes when the
   * SPEAKER LINE changes: once every twenty seconds or so, which is the actual rate of the news.
   *
   * It is resolved with `anchorForMs`, the same function the rail resolves a citation with, so the
   * "which block does this moment belong to" rule keeps exactly one implementation.
   */
  playingKey: string | null;
  /** Whether the recording is actually moving. Published by the player; see THE PLAYHEAD above. */
  isPlaying: boolean;
  publishPlaying: (playing: boolean) => void;
  /** Whether the transcript scrolls itself to keep the playing line in view. */
  isFollowing: boolean;
  setFollowing: (next: boolean) => void;
};

/**
 * Nothing marked, as ONE value rather than a new one every time.
 *
 * The context value is what every consumer re-renders on, and the transcript column is several
 * hundred rows on a meeting anybody bothers to read. A fresh `[]` on each clear is a new identity,
 * which is a new context value, which is that whole column re-rendering because a pointer left a
 * rail item — the same trap `anchorsEqual` is written against, one field shallower.
 */
const NO_MARKED_KEYS: readonly string[] = Object.freeze([]);

const ReadingSyncContext = createContext<ReadingSync | null>(null);

/** The sync, or null when this surface is being rendered without a rail beside it. */
export function useReadingSync(): ReadingSync | null {
  return useContext(ReadingSyncContext);
}

/**
 * Whether a keypress belongs to something else on the page.
 *
 * Space is the killer here. On a focused button it IS the button's activation, and a global
 * handler that swallows it turns every control in the record into a dead key for anybody working
 * without a mouse. `/` and `j` are ordinary characters the moment a text field has focus, which on
 * this page it very often does — the transcript is correctable in place.
 *
 * `closest`, not a tag check: the correction editor's textarea and the rail's summary buttons are
 * both nested inside other elements, and an event that bubbled up from a `<span>` inside a button
 * still belongs to the button.
 */
function isBusyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest("input, textarea, select, button, a[href], [role='menu'], [contenteditable]"),
  );
}

/**
 * Holds the two-way sync for one meeting record, and owns the reading keymap.
 *
 * The keymap listens on the window rather than on a focusable container, because a reader who has
 * just scrolled with the mouse wheel has focus on nothing at all, and demanding they click the
 * transcript first to make J work would make the shortcut undiscoverable. The listener is
 * mounted only while this provider is — which is only while the Transcript tab is open — so it
 * cannot fire over the Summary, Minutes or Artifacts panels.
 */
export function ReadingSyncProvider({
  children,
  seekSources,
}: {
  children: ReactNode;
  /**
   * The two origins the file↔meeting conversion needs, built once by the room page.
   *
   * Absent — /dev/transcript-preview, or any surface with no recording behind it — means no
   * playhead can be placed in the meeting, so `playingMs` stays null and nothing ever lights up as
   * playing. That is the same refusal seeking makes, in the same module, for the same reason.
   */
  seekSources?: SeekSources;
}) {
  const [anchors, setAnchors] = useState<readonly ReadingAnchor[]>([]);
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const [markedKeys, setMarkedKeysState] = useState<readonly string[]>(NO_MARKED_KEYS);
  const [playbackRequest, setPlaybackRequest] = useState<{ token: number } | null>(null);
  /** The playhead as the player last reported it, on the FILE axis. */
  const [playbackSeconds, setPlaybackSeconds] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // On by default: a reader who presses play has asked to be taken through the meeting. It is
  // turned off by their own scroll, never by anything this code does on its own.
  const [isFollowing, setIsFollowing] = useState(true);
  const lastPlayheadAtRef = useRef(0);

  // A ref, not state: the key handler is registered once and would otherwise close over whatever
  // navigator existed on the render that mounted it, which is none.
  const navigatorRef = useRef<ReadingNavigator | null>(null);

  const publishAnchors = useCallback((next: readonly ReadingAnchor[]) => {
    // The measurement runs after every layout pass, so this is called with an equal-but-new array
    // constantly. Setting state on those would re-render the rail, which re-lays out the column,
    // which measures again — see anchorsEqual.
    setAnchors((current) => (anchorsEqual(current, next) ? current : next));
  }, []);

  const setMarkedKeys = useCallback((next: readonly string[]) => {
    // The rail re-resolves the same claim to the same keys on every pointer event inside one item,
    // so this arrives equal-but-new constantly. Publishing those would re-render the transcript
    // column for a value that did not change — the reason publishAnchors goes through anchorsEqual,
    // and the reason a clear collapses back to the one frozen empty array instead of a fresh one.
    const incoming = next.length === 0 ? NO_MARKED_KEYS : next;
    setMarkedKeysState((current) =>
      current.length === incoming.length && current.every((key, index) => key === incoming[index])
        ? current
        : incoming,
    );
  }, []);

  const registerNavigator = useCallback((next: ReadingNavigator | null) => {
    navigatorRef.current = next;
  }, []);

  /**
   * The playhead, throttled, on its way in from the media element.
   *
   * A wall-clock gate rather than a comparison of the seconds themselves: `timeupdate` reports a
   * float that changes every time it fires, so "has it changed" is always yes and would throttle
   * nothing. Null clears the gate as well as the value, so a fresh element's first report lands
   * immediately instead of waiting out the interval left over from the previous one.
   */
  const publishPlaybackSeconds = useCallback((seconds: number | null) => {
    if (seconds === null) {
      lastPlayheadAtRef.current = 0;
      setPlaybackSeconds(null);
      return;
    }
    const now = Date.now();
    if (now - lastPlayheadAtRef.current < PLAYHEAD_INTERVAL_MS) return;
    lastPlayheadAtRef.current = now;
    setPlaybackSeconds(seconds);
  }, []);

  /**
   * The one place the file axis becomes the meeting axis.
   *
   * See the module header. The mirror of this — meeting → file — is `requestSeek` on the room page,
   * and the pair is unit-tested as exact inverses in recording-seek.test.ts.
   */
  const playingMs = useMemo(
    () =>
      playbackSeconds === null
        ? null
        : meetingMsFromRecordingSeconds(seekSources ?? {}, playbackSeconds),
    [seekSources, playbackSeconds],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = readingShortcut(event, isBusyTarget(event.target));
      if (!action) return;

      if (action === "toggle-playback") {
        // A token rather than a call, so a press that arrives before the recording has been
        // fetched is still a request the player can honour once it has one.
        setPlaybackRequest({ token: Date.now() });
        // Prevented only because we handled it. Space still scrolls the page everywhere this
        // provider is not mounted, which is everywhere but the Transcript tab.
        event.preventDefault();
        return;
      }

      const reading = navigatorRef.current;
      if (!reading) return;

      event.preventDefault();
      if (action === "open-search") {
        reading.focusSearch();
        return;
      }
      reading.step(action === "next-turn" ? 1 : -1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * The playhead as a block key. See `playingKey` on ReadingSync for why the conversion lands here
   * rather than in the column that draws the mark.
   */
  const playingKey = useMemo(
    () =>
      playingMs === null || anchors.length === 0
        ? null
        : (anchorForMs(anchors, playingMs)?.key ?? null),
    [anchors, playingMs],
  );

  const value = useMemo<ReadingSync>(
    () => ({
      anchors,
      publishAnchors,
      readingKey,
      setReadingKey,
      markedKeys,
      setMarkedKeys,
      registerNavigator,
      playbackRequest,
      publishPlaybackSeconds,
      playingKey,
      isPlaying,
      publishPlaying: setIsPlaying,
      isFollowing,
      setFollowing: setIsFollowing,
    }),
    [
      anchors,
      publishAnchors,
      readingKey,
      markedKeys,
      setMarkedKeys,
      registerNavigator,
      playbackRequest,
      publishPlaybackSeconds,
      playingKey,
      isPlaying,
      isFollowing,
    ],
  );

  return <ReadingSyncContext.Provider value={value}>{children}</ReadingSyncContext.Provider>;
}
