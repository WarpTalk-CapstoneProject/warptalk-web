"use client";

/**
 * One speaking turn in the Meet widget's transcript. WT-525 t2.
 *
 * WHY THIS IS A SECOND COPY OF THE IN-MEETING BUBBLE AND NOT AN IMPORT OF IT
 *   The widget has to read exactly like the in-meeting panel — the same face, the same name and
 *   clock, the same one-line-per-sentence body and the same "English → Vietnamese · 79%" footer —
 *   so somebody glancing from the main window to the popup over Meet sees one transcript, not two.
 *   The ideal would be to render `TranscriptBubble` from live/side-panel/transcript-panel.tsx, but
 *   it is private to that module and is wired to the main window's store (AI suggestions from
 *   translationRoom-store, which this separate Electron window never fills). Everything that
 *   DECIDES what a line says — which translation, which sentences, which confidence — is imported
 *   from lib/transcript instead, so the two bubbles can only disagree about markup, never about
 *   content.
 *
 * WHAT IS DELIBERATELY LEFT OUT
 *   The AI suggestion badge. Suggestions reach the main window through its room-group
 *   subscription; this window never joins the group (see use-bridge-widget-state.ts), so a badge
 *   here could only ever be empty.
 */

import { motion } from "motion/react";

import { AnimatedWords } from "@/components/rooms/live/animated-words";
import { useMeetingIdentity } from "@/components/rooms/live/meeting-identity-context";
import { ParticipantAvatar } from "@/components/rooms/live/participant-avatar";
import { getLanguageName } from "@/lib/language/languages";
import { splitIntoSentences } from "@/lib/transcript/sentence-flow";
import {
  confidencePercent,
  formatTranscriptClockTime,
  formatTranscriptTimestamp,
  resolveSegmentTranslation,
  type GroupedTranscriptSegment,
} from "@/lib/transcript/transcript-display";

/**
 * The lines one bubble renders, in the order the speaker produced them: split first where the
 * speaker stopped (`paragraphs`, measured by VAD), then on the punctuation the recogniser produced.
 *
 * This is `transcriptLines` from live/side-panel/transcript-panel.tsx, which is not exported and
 * which this task may not edit. It is kept to the one expression so there is nothing in it to
 * drift: the decisions live in `splitIntoSentences` and in groupTranscriptSegments' paragraphs,
 * both imported. TODO(WT-525): export one `transcriptLines` from lib/transcript/sentence-flow and
 * have both bubbles call it.
 */
function bubbleLines(segment: GroupedTranscriptSegment): string[] {
  const paragraphs = segment.paragraphs?.length ? segment.paragraphs : [segment.originalText];
  return paragraphs.flatMap((paragraph) => splitIntoSentences(paragraph));
}

export function WidgetTranscriptBubble({
  segment,
  isSelf,
  readerLanguage,
}: {
  // The GROUPED segment, as in the meeting: `paragraphs` is where the speaker stopped, and a raw
  // segment would lay a turn out one recogniser chunk — one breath — per bubble.
  segment: GroupedTranscriptSegment;
  isSelf: boolean;
  /**
   * The language THIS reader reads in, from the widget context. Every bubble resolves against the
   * same value, which is what WT-371 Bug 4 is about: the old popup printed
   * `Object.values(translations)[0]`, the first translation that happened to arrive, so the
   * direction a line claimed depended on arrival order rather than on who was reading.
   */
  readerLanguage: string | null;
}) {
  // The far side's name is the segment's: in a bridge room it is the stand-in participant, which
  // has no account, no roster row in this window and no face — only the name the server saved.
  const speakerName = segment.speakerName || "Speaker";
  const person = useMeetingIdentity(segment.speakerId, speakerName);
  const translation = resolveSegmentTranslation(segment, readerLanguage);
  const confidence = confidencePercent(segment.confidence);

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`flex gap-2 ${isSelf ? "flex-row-reverse" : "flex-row"}`}
    >
      <ParticipantAvatar identity={person} size="sm" className="mt-4" />
      <div className={`flex max-w-[85%] flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}>
        <div
          className={`flex min-w-0 items-center gap-1.5 px-1 text-[10px] text-ink-subtle ${isSelf ? "flex-row-reverse" : ""}`}
        >
          <span className="min-w-0 truncate text-[11px] font-semibold text-ink-muted">
            {isSelf ? "You" : speakerName}
          </span>
          {/* The clock when the line arrived live, the offset otherwise. Lines read from the
              saved transcript — which, until this window can receive room events, is all of them —
              carry no `receivedAt`, so they fall back exactly as the in-meeting panel does for a
              late joiner's backfill. */}
          <span
            className="shrink-0 font-mono tabular-nums"
            aria-label={
              segment.receivedAt
                ? `Spoken at ${formatTranscriptClockTime(segment.receivedAt)}`
                : `Meeting time ${formatTranscriptTimestamp(segment.startTimeMs)}`
            }
          >
            {segment.receivedAt
              ? formatTranscriptClockTime(segment.receivedAt)
              : formatTranscriptTimestamp(segment.startTimeMs)}
          </span>
        </div>

        <div
          className={`rounded-2xl px-3 py-2 shadow-sm ${
            isSelf
              ? "rounded-tr-sm bg-primary"
              : "rounded-tl-sm border border-border bg-surface-2/60"
          }`}
        >
          {/* One line per sentence, original muted and translation in medium weight, so the
              reader's own language is the line the eye lands on. */}
          {bubbleLines(segment).map((line, at) => (
            <p
              key={`${segment.segmentId}-o-${at}`}
              className={`text-[13px] leading-relaxed ${at > 0 ? "mt-1" : ""} ${isSelf ? "text-white" : "text-ink-muted"}`}
            >
              <AnimatedWords text={line} />
            </p>
          ))}
          {translation
            ? splitIntoSentences(translation).map((sentence, at) => (
                <p
                  key={`${segment.segmentId}-t-${at}`}
                  className={`text-[13px] font-medium leading-relaxed ${at === 0 ? "mt-1.5" : "mt-1"} ${isSelf ? "text-white" : "text-ink"}`}
                >
                  <AnimatedWords text={sentence} />
                </p>
              ))
            : null}
          <p
            className={`mt-2 flex items-center gap-1.5 text-[10px] font-medium ${isSelf ? "text-white/70" : "text-ink-subtle"}`}
          >
            {/* WT-371 Bug 4: the arrow points at the READER's language. A line already spoken in
                it has no translation (resolveSegmentTranslation returns null), so it shows one
                language and no arrow — nothing was translated for this reader, not something
                missing. */}
            <span>
              {getLanguageName(segment.originalLanguage)}
              {translation && readerLanguage ? ` → ${getLanguageName(readerLanguage)}` : ""}
            </span>
            {/* WT-371 Bug 3: stt_worker publishes a mean token LOG-probability, and
                confidencePercent is the one place that turns it into a real percentage. Hidden
                when the producer reported nothing, rather than shown as a confident 0% or 100%. */}
            {confidence !== null ? (
              <span
                title="How confident the speech recogniser was in this line"
                className={
                  isSelf
                    ? "rounded-full bg-white/15 px-1.5 py-px tabular-nums"
                    : "rounded-full bg-surface-2 px-1.5 py-px tabular-nums"
                }
              >
                {confidence}%
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </motion.article>
  );
}
