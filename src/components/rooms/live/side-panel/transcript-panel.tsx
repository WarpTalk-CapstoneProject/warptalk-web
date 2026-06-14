"use client";

import { useRef, useEffect } from "react";
import { ClosedCaptioning } from "@phosphor-icons/react/dist/ssr";
import { motion, AnimatePresence } from "motion/react";
import { getLanguageName } from "@/lib/languages";
import type { TranscriptSegmentDto } from "@/types/realtime";

export function TranscriptPanel({ segments }: { segments: TranscriptSegmentDto[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [segments]);

  if (!segments.length) {
    return <EmptyPanel text="Start WarpTalk to see live translation here." />;
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar scroll-smooth">
      <AnimatePresence initial={false}>
        {segments.map((segment) => (
          <TranscriptBubble key={segment.segmentId} segment={segment} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function TranscriptBubble({ segment }: { segment: TranscriptSegmentDto }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col gap-1 origin-bottom"
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink">{segment.speakerName || "Speaker"}</span>
        <span className="text-[11px] text-ink-subtle">
          {getLanguageName(segment.originalLanguage)}
          {segment.targetLanguage ? ` -> ${getLanguageName(segment.targetLanguage)}` : ""}
        </span>
      </div>
      <div className="rounded-lg border border-border bg-surface-1 p-3 shadow-sm">
        <p className="text-[13px] leading-relaxed text-ink-muted">{segment.originalText}</p>
        {segment.translatedText ? (
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink">{segment.translatedText}</p>
        ) : null}
      </div>
    </motion.div>
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
