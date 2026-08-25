"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { identityFor } from "@/lib/meeting/participant-identity";
import { groupTranscriptSegments } from "@/lib/transcript/transcript-display";
import type { GroupedTranscriptSegment } from "@/lib/transcript/transcript-display";
import { useMeetingIdentities } from "./meeting-identity-context";
import { ParticipantAvatar } from "./participant-avatar";

/** How many past utterances stay on screen in the full lane. Teams shows three; so does this. */
const LANE_LINES = 3;

/**
 * Live captions: what was SAID, in the language it was said in, attributed to a face.
 *
 * WHY IT IS A ROLLING LIST AND NOT ONE BOX
 *   It used to be a single centred box holding the newest sentence, which auto-hid after six
 *   seconds. Two things came out of that. Whoever looked away for a moment lost the line with no
 *   way back — the box was gone, not scrolled off. And because the box appeared and disappeared,
 *   the space under the video was empty half the time and occupied the other half, so the caption
 *   and the transcript panel read as two surfaces competing for the same job:
 *
 *     "subtitle và transcript như đang đấu nhau"
 *
 *   The two now say different things. This lane is the LIVE surface: the last few utterances, who
 *   said them, big enough to read across a room, scrollable by hand for the line you just missed.
 *   The transcript panel is the RECORD: every line, the reader's own translation of it, timestamps
 *   and confidence. Neither is a worse copy of the other.
 *
 * WHY IT STILL SHOWS ONLY THE ORIGINAL
 *   Unchanged from before, and deliberately. CC used to render the TRANSLATION with the original
 *   demoted underneath, which made turning captions on indistinguishable from turning translation
 *   on. Closed captions are an accessibility surface for the audio in the room; the translation has
 *   its own surfaces (the transcript panel, and the synthesised voice).
 *
 * Fed only by real segments from the AI pipeline over SignalR (TranscriptSegmentReceived /
 * TranslationTextReceived). There is no mock or preview fallback here.
 */
export function LiveSubtitleOverlay({
  enabled = true,
  /** "compact" is the minimised dock: one line, no surface of its own, over live video. */
  variant = "lane",
}: {
  enabled?: boolean;
  variant?: "lane" | "compact";
}) {
  const segments = useTranslationRoomStore((state) => state.transcriptSegments);
  const identities = useMeetingIdentities();
  const scrollRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    const spoken = groupTranscriptSegments(segments).filter((utterance) =>
      utterance.originalText?.trim(),
    );
    return spoken.slice(-(variant === "compact" ? 1 : LANE_LINES));
  }, [segments, variant]);

  const newest = lines[lines.length - 1];
  // Length, not just the id: a live utterance keeps the same segmentId while its text grows, and
  // the lane has to follow it down as it does.
  const tailKey = newest ? `${newest.segmentId}:${newest.originalText.length}` : "";

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [tailKey]);

  if (!enabled) return null;

  if (variant === "compact") {
    return (
      <div className="pointer-events-none flex h-full w-full items-end justify-center">
        <AnimatePresence>
          {newest ? (
            <motion.p
              key="compact-caption"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="line-clamp-2 max-w-full rounded-lg bg-black/75 px-2 py-1 text-[11px] font-medium leading-snug text-white"
            >
              {newest.originalText}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-caption-lane
      // Scrollable on purpose. The line you missed is one flick away instead of gone, which is
      // the whole difference between a caption and a caption you can use.
      className="h-full w-full overflow-y-auto overscroll-contain rounded-2xl bg-surface-2/60 px-3 py-2 custom-scrollbar"
    >
      <div className="flex min-h-full max-w-3xl flex-col justify-end gap-1.5">
        {lines.length === 0 ? (
          <p className="text-[13px] text-ink-subtle">
            Captions will appear here as people speak.
          </p>
        ) : (
          lines.map((line, index) => (
            <CaptionLine
              key={line.segmentId}
              line={line}
              identities={identities}
              // Older lines step back rather than disappear: still readable if you want them,
              // never competing with the sentence being spoken right now.
              dimmed={index < lines.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CaptionLine({
  line,
  identities,
  dimmed,
}: {
  line: GroupedTranscriptSegment;
  identities: ReturnType<typeof useMeetingIdentities>;
  dimmed: boolean;
}) {
  // `speakerName` was already resolved on arrival by resolveTranscriptSpeakerName, which guards
  // against a roster that hands back a UUID as somebody's display name. Preferring it here keeps
  // that guard; the identity map supplies the face and the language, which it alone knows.
  const person = identityFor(identities, line.speakerId, line.speakerName);
  const name = line.speakerName?.trim() || person.name;

  return (
    <motion.p
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: dimmed ? 0.55 : 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-start gap-2 text-[15px] leading-snug text-ink"
    >
      <ParticipantAvatar identity={person} size="xs" className="mt-px" />
      <span className="min-w-0">
        <span className="mr-1.5 font-semibold text-ink">{name}:</span>
        {/* Plain text, not <AnimatedWords>. Animating each word in reads well for a transcript
            being reviewed and badly for a caption being read live: the words the eye is on are
            still fading in. AnimatedWords stays in use in the transcript panel, where the reader
            sets the pace. */}
        <span>{line.originalText}</span>
      </span>
    </motion.p>
  );
}
