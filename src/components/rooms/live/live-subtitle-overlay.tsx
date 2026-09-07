"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { identityFor } from "@/lib/meeting/participant-identity";
import {
  captionTextForReader,
  groupTranscriptSegments,
} from "@/lib/transcript/transcript-display";
import type { GroupedTranscriptSegment } from "@/lib/transcript/transcript-display";
import { useMeetingIdentities } from "./meeting-identity-context";
import { ParticipantAvatar } from "./participant-avatar";

/** How many past utterances stay on screen in the full lane. Teams shows three; so does this. */
const LANE_LINES = 3;

/**
 * Live captions: what was said, IN THE READER'S OWN LANGUAGE, attributed to a face.
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
 * WHY IT SHOWS THE TRANSLATION AND NOT THE ORIGINAL
 *   REVERSED ON 2026-08-20, by the product owner, after reading it as a defect in a live meeting:
 *   a reader listening in English watched Vietnamese captions scroll past. This file previously
 *   argued the opposite — that CC is an accessibility surface for the audio in the room, so it
 *   should show the language actually being spoken. That reasoning holds for a meeting product.
 *   It does not hold for a TRANSLATION product, where the caption lane is the largest, most
 *   readable surface in the window and the one a participant watches instead of listening.
 *
 *   The original did not lose a home. The transcript panel shows it beside the reader's
 *   translation, with timestamps and confidence, which is a better place to read a source
 *   language than a three-line lane that scrolls.
 *
 *   The old worry — that turning captions on becomes indistinguishable from turning translation
 *   on — is answered in words on the CC control, not by withholding the translation.
 *
 * WHY A LINE CAN BE HELD BACK
 *   A transcript segment arrives before its translation does. Rendering the original in the
 *   meantime would put the line up in the wrong language and then change it under the reader,
 *   which is the thing being fixed rather than a smaller version of it. So a line with no
 *   caption for this reader yet is simply not shown yet — see captionTextForReader, which is
 *   also what keeps a same-language room captioned normally.
 *
 *   Only while translation is RUNNING, though. Transcription does not wait for Start
 *   Translation — the AI bot joins on the first published microphone — so before anybody
 *   presses it these lines are all there will ever be, and holding them for a translation
 *   nobody ordered is how the lane ends up blank for the first half of a meeting. Hence
 *   `translationActive`: off, the caption is what was said.
 *
 * Fed only by real segments from the AI pipeline over SignalR (TranscriptSegmentReceived /
 * TranslationTextReceived). There is no mock or preview fallback here.
 */
export function LiveSubtitleOverlay({
  enabled = true,
  /** "compact" is the minimised dock: one line, no surface of its own, over live video. */
  variant = "lane",
  readerLanguage,
  translationActive = true,
}: {
  enabled?: boolean;
  variant?: "lane" | "compact";
  /**
   * The language THIS viewer listens in. Omit and the lane falls back to the original, which is
   * what the dev preview page renders and what a cold join shows for its first moments — a blank
   * caption surface reads as broken, so it is never the answer to "not resolved yet".
   */
  readerLanguage?: string | null;
  /**
   * Whether translation is running in this room right now. False means the captions below are
   * all there will ever be for these lines, so they are shown as spoken rather than held for a
   * translation that is not coming — see captionTextForReader.
   */
  translationActive?: boolean;
}) {
  const segments = useTranslationRoomStore((state) => state.transcriptSegments);
  const identities = useMeetingIdentities();
  const scrollRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    // Resolved ONCE per utterance here rather than inside CaptionLine, so a line with nothing to
    // show this reader yet never occupies a slot. Filtering after the slice would leave the lane
    // rendering two lines and a gap.
    const spoken = groupTranscriptSegments(segments)
      .map((utterance) => ({
        utterance,
        caption: captionTextForReader(utterance, readerLanguage, translationActive),
      }))
      .filter((line): line is { utterance: GroupedTranscriptSegment; caption: string } =>
        Boolean(line.caption),
      );
    return spoken.slice(-(variant === "compact" ? 1 : LANE_LINES));
  }, [segments, variant, readerLanguage, translationActive]);

  const newest = lines[lines.length - 1];
  // Length, not just the id: a live utterance keeps the same segmentId while its text grows, and
  // the lane has to follow it down as it does. Measured on the CAPTION, because that is the text
  // that grows on screen — the original can lengthen while the translation has not caught up.
  const tailKey = newest ? `${newest.utterance.segmentId}:${newest.caption.length}` : "";

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
              {newest.caption}
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
              key={line.utterance.segmentId}
              line={line.utterance}
              caption={line.caption}
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
  caption,
  identities,
  dimmed,
}: {
  line: GroupedTranscriptSegment;
  /** Already resolved for this reader by captionTextForReader — never the raw original. */
  caption: string;
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
        <span>{caption}</span>
      </span>
    </motion.p>
  );
}
