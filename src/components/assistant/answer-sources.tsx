"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  BookMarked,
  ExternalLink,
  FileText,
  Globe,
  Library,
  Video,
  type LucideIcon,
} from "lucide-react";

import {
  answerSourceHref,
  SOURCE_KIND_LABEL,
  type AnswerSource,
  type AnswerSourceKind,
} from "@/lib/assistant/answer-sources";

/**
 * The row of chips under a WarpBot answer, naming what it used.
 *
 * WHY IT IS WORTH THE SPACE
 *     An assistant answer and a hallucination look identical. The chips are the only thing on
 *     screen that distinguishes them, and they only appear when the model pointed at a source
 *     the worker had genuinely retrieved (see lib/assistant/answer-sources). An answer with no
 *     chips is not broken — it is an answer that rested on the conversation itself, and the row
 *     is absent rather than showing an empty state that would read as a failure.
 *
 * WHY +N RATHER THAN A SCROLLING ROW
 *     The chat column is 13px and narrow on both surfaces. Four chips wrap into three lines and
 *     push the answer they belong to off screen. Three plus a counter keeps the row to one or
 *     two lines, and the counter is a button — the reader who cares gets all of them, and the
 *     reader who does not never pays for them.
 *
 * WHY MOST CHIPS DO NOT LINK
 *     Only a url and a document id have a destination this client can be sure of. A chip that
 *     404s tells the reader the source does not exist, which is the exact opposite of the claim
 *     it is there to make. So a chip with nowhere real to go is a label, not a link.
 */

const KIND_ICON: Record<AnswerSourceKind, LucideIcon> = {
  document: FileText,
  glossary: BookMarked,
  knowledge: Library,
  meeting: Video,
  transcript: AudioLines,
  web: Globe,
};

const COLLAPSED_COUNT = 3;

/**
 * Two homes, two grounds. "default" sits on the page surface; "inverted" sits inside a
 * primary-coloured bubble, where surface tokens read as a grey box pasted onto purple.
 */
type SourcesTone = "default" | "inverted";

const TONE: Record<SourcesTone, { label: string; chip: string; hover: string }> = {
  default: {
    label: "text-ink-subtle",
    chip: "border-hairline bg-surface-2 text-ink-subtle",
    hover: "hover:text-ink",
  },
  inverted: {
    label: "text-white/45",
    chip: "border-white/25 bg-white/10 text-white/75",
    hover: "hover:text-white",
  },
};

interface AnswerSourcesProps {
  sources: AnswerSource[];
  /** Needed only to link document chips; without it they render as plain labels. */
  workspaceSlug?: string | null;
  tone?: SourcesTone;
  className?: string;
}

export function AnswerSources({
  sources,
  workspaceSlug,
  tone = "default",
  className,
}: AnswerSourcesProps) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  const shown = expanded ? sources : sources.slice(0, COLLAPSED_COUNT);
  const hidden = sources.length - shown.length;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 pt-2 ${className ?? ""}`}
    >
      {/* Named, not just implied by the icons. "Sources" is what makes the row a provenance
          claim rather than a set of decorative tags. */}
      <span
        className={`text-[10px] uppercase tracking-wide ${TONE[tone].label}`}
      >
        Sources
      </span>
      {shown.map((source) => (
        <SourceChip
          key={source.marker}
          source={source}
          workspaceSlug={workspaceSlug}
          tone={tone}
        />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${TONE[tone].chip} ${TONE[tone].hover}`}
          aria-label={`Show ${hidden} more source${hidden === 1 ? "" : "s"}`}
        >
          +{hidden}
        </button>
      )}
    </div>
  );
}

function SourceChip({
  source,
  workspaceSlug,
  tone,
}: {
  source: AnswerSource;
  workspaceSlug?: string | null;
  tone: SourcesTone;
}) {
  const Icon = KIND_ICON[source.kind];
  const href = answerSourceHref(source, workspaceSlug);
  // The kind on the tooltip, not on the chip. "Glossary · sáp nhập" in 11px eats the whole row
  // for a word the icon already carries; on hover it answers the only question the chip raises.
  const label = `${SOURCE_KIND_LABEL[source.kind]} · ${source.title}`;

  const body = (
    <>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="max-w-[140px] truncate">{source.title}</span>
      {href && source.kind === "web" && (
        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />
      )}
    </>
  );

  const shell = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${TONE[tone].chip}`;

  if (!href) {
    return (
      <span className={shell} title={label}>
        {body}
      </span>
    );
  }

  if (source.kind === "web") {
    return (
      <a
        href={href}
        target="_blank"
        // noreferrer as well as noopener: the destination came out of a model's tool result,
        // and it has no business learning which WarpTalk page the reader was on.
        rel="noopener noreferrer"
        title={label}
        className={`${shell} transition-colors ${TONE[tone].hover}`}
      >
        {body}
      </a>
    );
  }

  return (
    <Link
      href={href}
      title={label}
      className={`${shell} transition-colors ${TONE[tone].hover}`}
    >
      {body}
    </Link>
  );
}
