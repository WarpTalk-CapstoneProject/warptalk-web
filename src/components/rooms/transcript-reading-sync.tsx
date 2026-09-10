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
 *   Sideways, once:           a navigator and a playback toggle, registered by whoever owns the
 *                             DOM for them, so the keymap can live in ONE place instead of being
 *                             re-implemented by every surface that has a key to handle.
 *
 *   Nothing here knows about milliseconds except through document-reading.ts. The rail resolves a
 *   citation's moment to a block key and publishes the key; the transcript compares keys. That is
 *   what stops the "which paragraph does this claim cover" rule existing in two places and drifting
 *   — it was the single most likely way for this feature to end up quietly off by one turn.
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
  anchorsEqual,
  readingShortcut,
  type ReadingAnchor,
} from "@/lib/transcript/document-reading";

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
export function ReadingSyncProvider({ children }: { children: ReactNode }) {
  const [anchors, setAnchors] = useState<readonly ReadingAnchor[]>([]);
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const [markedKeys, setMarkedKeysState] = useState<readonly string[]>(NO_MARKED_KEYS);
  const [playbackRequest, setPlaybackRequest] = useState<{ token: number } | null>(null);

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
    }),
    [
      anchors,
      publishAnchors,
      readingKey,
      markedKeys,
      setMarkedKeys,
      registerNavigator,
      playbackRequest,
    ],
  );

  return <ReadingSyncContext.Provider value={value}>{children}</ReadingSyncContext.Provider>;
}
