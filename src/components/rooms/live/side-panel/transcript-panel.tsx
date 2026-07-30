"use client";

import { useRef, useEffect, useMemo } from "react";
import { ClosedCaptioning } from "@phosphor-icons/react/dist/ssr";
import { motion, AnimatePresence } from "motion/react";
import { getLanguageName } from "@/lib/languages";
import { formatTranscriptTimestamp, groupTranscriptSegments } from "@/lib/transcript-display";
import { AnimatedWords } from "@/components/rooms/live/animated-words";
import type { TranscriptSegmentDto } from "@/types/realtime";

export function TranscriptPanel({ segments }: { segments: TranscriptSegmentDto[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const utterances = useMemo(() => groupTranscriptSegments(segments), [segments]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [utterances]);

  if (!segments.length) {
    return <EmptyPanel text="Start WarpTalk to see live translation here." />;
  }

  return (
    <div ref={containerRef} className="flex-1 space-y-2.5 overflow-y-auto p-3 custom-scrollbar scroll-smooth">
      <AnimatePresence initial={false}>
        {utterances.map((segment) => (
          <TranscriptBubble key={segment.segmentId} segment={segment} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function TranscriptBubble({ segment }: { segment: TranscriptSegmentDto }) {
  const speakerName = segment.speakerName || "Speaker";

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-border bg-surface-2/60 p-3 shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-surface-1 text-[10px] font-semibold text-ink-muted shadow-sm">
          {initials(speakerName)}
        </div>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
          {speakerName}
        </span>
        <span
          className="shrink-0 font-mono text-[10px] tabular-nums text-ink-subtle"
          aria-label={`Meeting time ${formatTranscriptTimestamp(segment.startTimeMs)}`}
        >
          {formatTranscriptTimestamp(segment.startTimeMs)}
        </span>
      </div>

      <div className="mt-2.5">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          <AnimatedWords text={segment.originalText} />
        </p>
        {segment.translatedText ? (
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink">
            <AnimatedWords text={segment.translatedText} />
          </p>
        ) : null}
        <p className="mt-2 text-[10px] font-medium text-ink-subtle">
          {getLanguageName(segment.originalLanguage)}
          {segment.targetLanguage ? ` → ${getLanguageName(segment.targetLanguage)}` : ""}
        </p>
      </div>
    </motion.article>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
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
