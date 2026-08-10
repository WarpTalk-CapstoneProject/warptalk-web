"use client";

import { useRef, useEffect, useMemo } from "react";
import { ClosedCaptioning } from "@phosphor-icons/react/dist/ssr";
import { motion, AnimatePresence } from "motion/react";
import { getLanguageName } from "@/lib/language/languages";
import {
  findSuggestionForUtterance,
  formatTranscriptTimestamp,
  groupSegmentsByTranslationSession,
  groupTranscriptSegments,
  type GroupedTranscriptSegment,
  type TranslationSessionBlock,
} from "@/lib/transcript/transcript-display";
import { AnimatedWords } from "@/components/rooms/live/animated-words";
import { SuggestionStrip } from "@/components/rooms/live/side-panel/suggestion-strip";
import { useTranslationRoomSessions } from "@/hooks/use-translationRooms";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import type { AiSuggestionDto, TranscriptSegmentDto } from "@/types/realtime";

export function TranscriptPanel({
  segments,
  roomId,
  baseTime,
  missedCount = 0,
}: {
  segments: TranscriptSegmentDto[];
  roomId: string;
  /** Lines that were already spoken when this person joined. 0 for anyone who was here. */
  missedCount?: number;
  /** Room start time — segments' startTimeMs is elapsed ms from here, used to bucket
   * them into "Translation N" sessions. Omit to skip session labeling. */
  baseTime?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const suggestions = useTranslationRoomStore((state) => state.suggestions);
  const dismissSuggestion = useTranslationRoomStore((state) => state.dismissSuggestion);
  const sessionsQuery = useTranslationRoomSessions(roomId);
  const sessions = sessionsQuery.data;

  const blocks = useMemo(() => {
    const utterances = groupTranscriptSegments(segments);
    return groupSegmentsByTranslationSession(utterances, sessions ?? [], baseTime);
  }, [segments, sessions, baseTime]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [blocks]);

  if (!segments.length) {
    return <EmptyPanel text="Start WarpTalk to see live translation here." />;
  }

  const showSessionLabels = blocks.length > 1;

  return (
    <div ref={containerRef} className="flex-1 space-y-1 overflow-y-auto p-3 custom-scrollbar scroll-smooth">
      {/* Said once, at the top, rather than as a divider inside the list: consecutive lines
          from one speaker are merged into a single utterance, so there is no reliable seam to
          put a marker on. Someone who was here from the start sees nothing. */}
      {missedCount > 0 ? (
        <div className="mb-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
          You joined after{" "}
          <span className="font-medium text-ink">
            {missedCount} {missedCount === 1 ? "line" : "lines"}
          </span>{" "}
          had already been said. They are shown above the live transcript.
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {blocks.map((block) => (
          <div key={block.sessionNumber} className="space-y-2">
            {showSessionLabels ? <SessionDivider block={block} /> : null}
            {block.segments.map((segment) => (
              <TranscriptBubble
                key={segment.segmentId}
                segment={segment}
                isSelf={Boolean(currentUserId) && segment.speakerId === currentUserId}
                suggestion={findSuggestionForUtterance(segment, suggestions)}
                onDismissSuggestion={dismissSuggestion}
              />
            ))}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function SessionDivider({ block }: { block: TranslationSessionBlock<GroupedTranscriptSegment> }) {
  return (
    <div className="flex items-center gap-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
      <div className="h-px flex-1 bg-border" />
      <span>
        Translation {block.sessionNumber}
        {formatSessionWindow(block.session)}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function formatSessionWindow(session: TranslationSessionBlock<unknown>["session"]) {
  if (!session?.startedAt) return "";
  const started = new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const ended = session.endedAt
    ? new Date(session.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "now";
  return ` · ${started}–${ended}`;
}

function TranscriptBubble({
  segment,
  isSelf,
  suggestion,
  onDismissSuggestion,
}: {
  segment: TranscriptSegmentDto;
  isSelf: boolean;
  suggestion?: AiSuggestionDto;
  onDismissSuggestion: (segmentId: string) => void;
}) {
  const speakerName = segment.speakerName || "Speaker";

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isSelf ? "justify-end" : "justify-start"}`}
    >
      <div className={`flex max-w-[85%] flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}>
        <AnimatePresence>
          {suggestion ? (
            <SuggestionStrip
              key={suggestion.segmentId}
              suggestion={suggestion}
              isSelf={isSelf}
              onDismiss={() => onDismissSuggestion(suggestion.segmentId)}
            />
          ) : null}
        </AnimatePresence>

        <div className={`flex min-w-0 items-baseline gap-1.5 px-1 text-[10px] text-ink-subtle ${isSelf ? "flex-row-reverse" : ""}`}>
          <span className="min-w-0 truncate font-semibold text-ink-muted">
            {isSelf ? "You" : speakerName}
          </span>
          <span
            className="shrink-0 font-mono tabular-nums"
            aria-label={`Meeting time ${formatTranscriptTimestamp(segment.startTimeMs)}`}
          >
            {formatTranscriptTimestamp(segment.startTimeMs)}
          </span>
        </div>

        <div
          className={`rounded-2xl px-3 py-2 shadow-sm ${
            isSelf
              ? "rounded-tr-sm bg-primary"
              : "rounded-tl-sm border border-border bg-surface-2/60"
          }`}
        >
          <p className={`text-[13px] leading-relaxed ${isSelf ? "text-white" : "text-ink-muted"}`}>
            <AnimatedWords text={segment.originalText} />
          </p>
          {segment.translatedText ? (
            <p className={`mt-1.5 text-[13px] font-medium leading-relaxed ${isSelf ? "text-white" : "text-ink"}`}>
              <AnimatedWords text={segment.translatedText} />
            </p>
          ) : null}
          <p className={`mt-2 flex items-center gap-1.5 text-[10px] font-medium ${isSelf ? "text-white/70" : "text-ink-subtle"}`}>
            <span>
              {getLanguageName(segment.originalLanguage)}
              {segment.targetLanguage ? ` → ${getLanguageName(segment.targetLanguage)}` : ""}
            </span>
            {/* How sure the recogniser was. Shown only when the segment actually carries it —
                realtime delta events do not, and printing "0%" for "not measured" would be a
                confident lie about an uncertain line. Rounded, because a decimal place on a
                confidence score implies a precision that is not there. */}
            {typeof segment.confidence === "number" ? (
              <span
                title="How confident the speech recogniser was in this line"
                className={
                  isSelf
                    ? "rounded-full bg-white/15 px-1.5 py-px tabular-nums"
                    : "rounded-full bg-surface-2 px-1.5 py-px tabular-nums"
                }
              >
                {Math.round(segment.confidence * 100)}%
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </motion.article>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full flex-col items-center justify-center gap-3 text-center"
    >
      <ClosedCaptioning className="h-8 w-8 text-ink-tertiary" weight="light" />
      <p className="text-[13px] text-ink-subtle max-w-[200px]">{text}</p>
    </motion.div>
  );
}
