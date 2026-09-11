"use client";

/**
 * The transcript panel the desktop app opens in its own small always-on-top window during an
 * external-bridge meeting.
 *
 * It is a separate route rather than a mode of the in-meeting panel because the user is not
 * looking at WarpTalk: they are in Google Meet, and this floats over it. That rules out the
 * meeting chrome entirely — no participant grid, no control bar, no navigation — and it means the
 * page has to be legible at 460px wide and from further away than a normal panel.
 *
 * The data is the same TranscriptSegmentReceived stream every other surface reads. Nothing about
 * an external-bridge room is special on the wire; the far side simply arrives as one speaker.
 *
 * WT-577 — WHAT CHANGED, AND WHY EACH OF THEM WAS A BUG
 *
 *   CONTROLS. WT-525 asked the overlay for four things: Start/Stop Translation, a voice picker, a
 *   voice clone toggle and a live transcript. This page shipped with the fourth, which meant a
 *   user watching their Meet call had to go and find the WarpTalk window — the exact tab-switch
 *   the overlay exists to remove — to do anything at all. The other three now live in
 *   BridgeOverlayControls above the transcript.
 *
 *   THEME. `bg-[#0b0b0c] text-white` was written on `<main>`, which overrode the theme the root
 *   layout had already applied. A user on the light theme got one black window among their own
 *   windows, and the only one of them WarpTalk owns.
 *
 *   SCROLLING. `scrollIntoView` fired on every segment, unconditionally, so reading anything
 *   older than the newest line was impossible: the window yanked itself back down mid-sentence
 *   each time anybody spoke. It now follows only while the reader is at the bottom, and offers
 *   the same "↓ Latest" chip the in-app panels use — the conclusion WT-573 reached for them.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   Per-speaker avatars and the "name this voice" flow (WT-577 items 5-6) need the inbound leg
 *   split into distinct speakers first. Until WT-585 lands the diarization, every line from the
 *   far side genuinely carries one speaker id, and drawing "Speaker 2" over a stream nothing has
 *   separated would be an assertion this page cannot support.
 */

import * as signalR from "@microsoft/signalr";
import { useEffect, useMemo, useRef, useState } from "react";
import { use } from "react";

import { BridgeOverlayControls } from "@/components/rooms/bridge/bridge-overlay-controls";
import { ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { useScrollToLatest } from "@/hooks/use-scroll-to-latest";
import { useAuthStore } from "@/stores/auth-store";
import type { TranscriptSegmentDto } from "@/types/realtime";

type ConnectionState = "connecting" | "live" | "reconnecting" | "failed";

const STATE_LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  failed: "Disconnected",
};

/**
 * How close to the bottom still counts as following.
 *
 * Matches the in-meeting transcript panel, so the chip appears at exactly the moment this window
 * stops scrolling itself. A threshold that disagreed with the auto-scroll rule would either offer
 * a jump to a bottom the window is already gliding towards, or hide the chip on a window that has
 * quietly stopped — both of which read as a broken control rather than an off-by-30-pixels.
 */
const STICK_TO_BOTTOM_PX = 48;

export default function DesktopTranscriptPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [segments, setSegments] = useState<TranscriptSegmentDto[]>([]);
  const [state, setState] = useState<ConnectionState>("connecting");
  /**
   * Owned here rather than inside the controls because nothing can read it back from the server:
   * consent is written to the audio route and never returned. State one level up at least
   * survives a re-render of the control strip.
   */
  const [voiceCloneEnabled, setVoiceCloneEnabled] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /**
   * Whether the reader was at the bottom the last time they moved.
   *
   * True initially: an empty transcript is at its bottom, and the first line to arrive should be
   * followed. Updated from the scroll handler, which fires for the auto-scroll too, so a reader
   * who has been carried back down starts being followed again without doing anything.
   */
  const stickToBottomRef = useRef(true);

  const { isAway, scrollToLatest } = useScrollToLatest(scrollerRef, {
    threshold: STICK_TO_BOTTOM_PX,
    revision: segments.length,
  });

  useEffect(() => {
    if (!roomId || !accessToken) return;

    const base = process.env.NEXT_PUBLIC_SIGNALR_URL;
    if (!base) {
      setState("failed");
      return;
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${base}/hubs/translation-room`, { accessTokenFactory: () => accessToken })
      .withAutomaticReconnect()
      .build();

    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegmentDto) => {
      setSegments((prev) => {
        // Segments are revised in place as recognition firms up, so replace rather than append.
        const index = prev.findIndex((existing) => existing.segmentId === segment.segmentId);
        if (index === -1) return [...prev, segment];
        const next = [...prev];
        next[index] = segment;
        return next;
      });
    });

    connection.onreconnecting(() => setState("reconnecting"));
    connection.onreconnected(() => setState("live"));
    connection.onclose(() => setState("failed"));

    connection
      .start()
      .then(() => setState("live"))
      .catch(() => setState("failed"));

    return () => {
      void connection.stop();
    };
  }, [roomId, accessToken]);

  /**
   * Follow the newest line, but only for a reader who is already there.
   *
   * This used to be an unconditional `scrollIntoView` on every segment. In a live meeting that is
   * a new segment every few seconds, so scrolling up to re-read something was impossible — the
   * window pulled itself back down before the sentence could be finished.
   *
   * THE MEASUREMENT HAS TO PREDATE THE CONTENT. An effect runs after the new segment is already in
   * the DOM, so measuring there asks "is the reader at the bottom of a list that just grew", and a
   * reader who WAS at the bottom is now a segment's height away from it — they would be classed as
   * having scrolled up, by the very line they were waiting for. The scroll handler records
   * stickiness at the last moment the reader actually moved, which is the question worth asking.
   */
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    if (!stickToBottomRef.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [segments]);

  const hasContent = segments.length > 0;
  const statusTone = useMemo(
    // `bg-destructive`, not `bg-danger`: --color-danger is not registered in @theme, so in
    // Tailwind v4 that utility does not exist and the dot would be transparent in the one state
    // where it has something to say.
    () =>
      state === "live"
        ? "bg-emerald-500"
        : state === "failed"
          ? "bg-destructive"
          : "bg-amber-500",
    [state],
  );

  return (
    <main className="flex h-[100dvh] flex-col bg-canvas text-ink">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <span className={`size-2 rounded-full ${statusTone}`} aria-hidden />
        <span className="text-sm font-medium">Transcript</span>
        <span className="ml-auto text-xs text-ink-subtle">{STATE_LABEL[state]}</span>
      </header>

      {/* Above the transcript, not below it: the transcript grows, and a control strip that moves
          with it is a control strip the user has to hunt for while the meeting is running. */}
      {accessToken ? (
        <BridgeOverlayControls
          roomId={roomId}
          voiceCloneEnabled={voiceCloneEnabled}
          onVoiceCloneEnabledChange={setVoiceCloneEnabled}
        />
      ) : null}

      {/* `relative` because the chip floats over the bottom of this scroller. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            stickToBottomRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight
              <= STICK_TO_BOTTOM_PX;
          }}
          className="h-full space-y-4 overflow-y-auto px-4 py-4"
        >
          {!accessToken && (
            <p className="text-sm text-ink-muted">
              Sign in to the WarpTalk window to see the transcript.
            </p>
          )}

          {accessToken && !hasContent && (
            <p className="text-sm text-ink-muted">
              Waiting for the first thing anyone says. Speak in your meeting and it will appear
              here.
            </p>
          )}

          {segments.map((segment) => {
            // Every translation the room produced, keyed by language. Which one to show is the
            // reader's choice everywhere else in the app; in a two-seat bridge room there is only
            // ever one, so showing whatever arrived avoids a language picker in a 460px window.
            const translation = segment.translations
              ? Object.values(segment.translations)[0]
              : segment.translatedText;

            return (
              <article key={segment.segmentId} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  {segment.speakerName}
                </p>
                <p className="text-[15px] leading-snug text-ink">{segment.originalText}</p>
                {translation && (
                  <p className="border-l-2 border-border pl-2 text-[15px] leading-snug text-ink-muted">
                    {translation}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        <ScrollToLatestChip visible={isAway} onClick={scrollToLatest} />
      </div>
    </main>
  );
}
