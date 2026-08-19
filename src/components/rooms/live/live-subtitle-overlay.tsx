"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import {
  groupTranscriptSegments,
  isTranscriptControlMarker,
} from "@/lib/transcript/transcript-display";
import type { TranscriptSegmentDto } from "@/types/realtime";

const HIDE_AFTER_MS = 6000;

/**
 * Live captions: what was SAID, in the language it was said in.
 *
 * CC used to render the TRANSLATION as the caption, with the original demoted to a grey
 * subline underneath it. That made one button do two jobs — turning captions on was
 * indistinguishable from turning translation on, and a room whose translation was not running
 * showed captions that looked broken rather than captions of the original speech. Closed
 * captions are an accessibility surface for the audio in the room; the translation has its own
 * surfaces (the transcript panel, and the synthesised voice).
 *
 * So this shows `originalText` and nothing else. A segment that somehow carries only a
 * translation is skipped rather than substituted, because silently showing translated words
 * under a control labelled CC is the exact confusion this removes.
 *
 * Shows ONLY real segments coming from the AI pipeline via SignalR
 * (TranscriptSegmentReceived / TranslationTextReceived) — there is no mock/preview fallback
 * here. The caption auto-hides after a short idle gap.
 */
export function LiveSubtitleOverlay({ enabled = true }: { enabled?: boolean }) {
  const segments = useTranslationRoomStore((state) => state.transcriptSegments);
  const utterances = useMemo(() => groupTranscriptSegments(segments), [segments]);
  const latest = useMemo(() => pickLatest(utterances), [utterances]);
  // Tracks the caption that has already auto-hidden. Visibility is derived from
  // it (never set synchronously in the effect) so the caption shows the instant
  // fresh content arrives and hides once the idle timer fires.
  const [hiddenKey, setHiddenKey] = useState("");

  const original = latest?.originalText?.trim();
  const contentKey = original ? `${latest?.segmentId}:${original}` : "";

  useEffect(() => {
    if (!enabled || !contentKey) return;
    const timer = setTimeout(() => setHiddenKey(contentKey), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [contentKey, enabled]);

  if (!enabled) return null;

  const visible = Boolean(contentKey) && contentKey !== hiddenKey;

  return (
    <div className="pointer-events-none flex h-full w-full items-center justify-center px-4">
      <AnimatePresence>
        {visible && latest && original ? (
          // WT-533: keyed on a CONSTANT, not on segmentId.
          //
          // Keying on the segment made every streamed chunk a different element, so
          // AnimatePresence unmounted the caption and mounted a replacement — a full exit-then-
          // enter, several times a second, while somebody was still speaking. That is the
          // flicker and the vertical jump in the report; it was the caption being destroyed and
          // rebuilt rather than updated. One long-lived box whose text changes has neither.
          //
          // Opacity only, no `y`. A caption that slides is a caption that moves under the reader
          // mid-sentence, and there is nothing to communicate by moving it.
          //
          // No `backdrop-blur`: it forces the compositor to re-rasterise the region behind the
          // box on every frame of live video, which is the "mờ chữ" — text sampled through a
          // blur that never settles. A solid panel is more readable and costs nothing.
          <motion.div
            key="live-caption"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="max-w-3xl rounded-xl bg-black/80 px-4 py-2.5 text-center shadow-lg"
          >
            {latest.speakerName ? (
              <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-white/60">
                {latest.speakerName}
              </span>
            ) : null}
            {/* Plain text, not <AnimatedWords>. Animating each word in as it arrives reads well
                for a transcript being reviewed and badly for a caption being read live: the
                words the eye is on are still fading in. AnimatedWords stays in use in the
                transcript panel, where the reader sets the pace. */}
            <p className="text-[18px] font-semibold leading-snug text-white">{original}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Most recent segment that actually has SPOKEN words on it.
 *
 * Deliberately not "…or a translation": a translation-only segment has nothing to caption, and
 * falling back to the last segment regardless would put an empty caption box on screen.
 */
function pickLatest(segments: TranscriptSegmentDto[]): TranscriptSegmentDto | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    // A control marker has originalText and would otherwise qualify — `__MEETING_END__` is
    // published onto the STT stream the instant a meeting ends, which is exactly when it would
    // flash across the screen as the closing caption.
    if (isTranscriptControlMarker(segments[i].originalText)) continue;
    if (segments[i].originalText?.trim()) return segments[i];
  }
  return null;
}
