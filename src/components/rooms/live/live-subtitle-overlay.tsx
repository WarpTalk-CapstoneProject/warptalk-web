"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { groupTranscriptSegments } from "@/lib/transcript-display";
import { AnimatedWords } from "@/components/rooms/live/animated-words";
import type { TranscriptSegmentDto } from "@/types/realtime";

const HIDE_AFTER_MS = 6000;

/**
 * Live caption display rendered in the meeting's reserved subtitle lane.
 *
 * Shows ONLY real transcript/translation segments coming from the AI pipeline
 * via SignalR (TranscriptSegmentReceived / TranslationTextReceived) — there is
 * no mock/preview fallback here. The caption auto-hides after a short idle gap.
 */
export function LiveSubtitleOverlay({ enabled = true }: { enabled?: boolean }) {
  const segments = useTranslationRoomStore((state) => state.transcriptSegments);
  const utterances = useMemo(() => groupTranscriptSegments(segments), [segments]);
  const latest = useMemo(() => pickLatest(utterances), [utterances]);
  // Tracks the caption that has already auto-hidden. Visibility is derived from
  // it (never set synchronously in the effect) so the caption shows the instant
  // fresh content arrives and hides once the idle timer fires.
  const [hiddenKey, setHiddenKey] = useState("");

  const translated = latest?.translatedText?.trim();
  const original = latest?.originalText?.trim();
  const contentKey = translated || original ? `${latest?.segmentId}:${translated ?? ""}:${original ?? ""}` : "";

  useEffect(() => {
    if (!enabled || !contentKey) return;
    const timer = setTimeout(() => setHiddenKey(contentKey), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [contentKey, enabled]);

  if (!enabled) return null;

  const visible = Boolean(contentKey) && contentKey !== hiddenKey;
  const showTranslated = Boolean(translated);

  return (
    <div className="pointer-events-none flex h-full w-full items-center justify-center px-4">
      <AnimatePresence>
        {visible && latest && (original || translated) ? (
          <motion.div
            key={latest.segmentId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="max-w-3xl rounded-xl bg-black/70 px-4 py-2.5 text-center shadow-lg backdrop-blur"
          >
            {latest.speakerName ? (
              <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-white/60">
                {latest.speakerName}
              </span>
            ) : null}
            {translated ? (
              <p className="text-[18px] font-semibold leading-snug text-white">
                <AnimatedWords text={translated} maxCharacters={96} />
              </p>
            ) : null}
            {original ? (
              <p
                className={
                  showTranslated
                    ? "mt-0.5 text-[13px] leading-snug text-white/60"
                    : "text-[18px] font-semibold leading-snug text-white"
                }
              >
                <AnimatedWords text={original} maxCharacters={96} />
              </p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Most recently updated segment that actually has caption content. */
function pickLatest(segments: TranscriptSegmentDto[]): TranscriptSegmentDto | null {
  if (!segments.length) return null;
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (segment.originalText?.trim() || segment.translatedText?.trim()) {
      return segment;
    }
  }
  return segments[segments.length - 1];
}
