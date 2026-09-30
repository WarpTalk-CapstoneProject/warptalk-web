"use client";

import { useMemo, useState } from "react";
import {
  CheckSquare,
  Copy,
  DownloadSimple,
  Sparkle,
  Square,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { SummaryMarkdown } from "@/components/markdown/document-markdown";
import { readSummaryArtifact } from "@/lib/meeting/artifact-content";
import { parseSummarySections } from "@/lib/meeting/meeting-summary";
import { describeAbsence } from "@/lib/meeting/artifact-library";
import type { LibraryEntry } from "@/lib/meeting/artifact-library";
import { useSummaryRenderings } from "@/hooks/use-summary-renderings";
import { downloadSavedSummaryDocx } from "@/lib/documents/download-saved-record";

export function SummaryReadingReader({
  entry,
  roomId,
}: {
  entry: LibraryEntry;
  roomId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Load any existing renderings (templates/languages)
  const renderingsQuery = useSummaryRenderings(roomId);
  const renderings = renderingsQuery.data ?? [];

  const parsedSummary = useMemo(() => {
    if (!entry.body) return null;
    return readSummaryArtifact(entry.body);
  }, [entry.body]);

  const parsedSections = useMemo(() => {
    if (!entry.body) return [];
    try {
      const rawObj = JSON.parse(entry.body);
      if (typeof rawObj === "object" && rawObj !== null && !Array.isArray(rawObj)) {
        return parseSummarySections(rawObj as Record<string, unknown>);
      }
    } catch {
      // Body is plain markdown text, not JSON
    }
    return [];
  }, [entry.body]);

  async function copySummary() {
    if (!entry.body) return;
    try {
      await navigator.clipboard.writeText(entry.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Summary copied to clipboard");
    } catch {
      toast.error("Could not copy summary");
    }
  }

  /** The same .docx the Recap rail downloads, built from the summary shown here. */
  async function downloadSummary() {
    if (!entry.body || downloading) return;
    setDownloading(true);
    try {
      const ended = Date.parse(entry.meetingEndedAt);
      await downloadSavedSummaryDocx({
        body: entry.body,
        meetingTitle: entry.roomTitle,
        // The entry carries the end and the length; the document is dated by the start.
        startedAt: Number.isNaN(ended)
          ? null
          : new Date(ended - Math.max(0, entry.durationSeconds || 0) * 1000).toISOString(),
        hostName: entry.hostName,
      });
    } catch {
      toast.error("Could not download summary");
    } finally {
      setDownloading(false);
    }
  }

  if (entry.absence) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-5">
          <Sparkle size={20} className="mt-0.5 text-ink-subtle" />
          <div>
            <h3 className="text-[13px] font-medium text-ink">AI Summary unavailable</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              {describeAbsence(entry.absence, entry.kind)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Top Toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-1/95 px-5 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink">
            <Sparkle size={13} className="text-amber-500" />
            <span>AI Meeting Summary</span>
          </span>

          {renderings.length > 0 ? (
            <span className="text-[11px] text-ink-subtle">
              ({renderings.length} {renderings.length === 1 ? "template" : "templates"} generated)
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copySummary}
            className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <Copy size={13} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={() => void downloadSummary()}
            disabled={downloading}
            title="Download summary (.docx)"
            className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-60"
          >
            <DownloadSimple size={13} />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Main Document Body */}
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        {parsedSummary ? (
          <div className="space-y-6">
            {/* Executive Overview */}
            {parsedSummary.summary ? (
              <section className="rounded-lg border border-border bg-surface-2 p-5 shadow-xs">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-subtle">
                  Overview
                </h2>
                <div className="mt-2 text-[13.5px] leading-relaxed text-ink">
                  <SummaryMarkdown>{parsedSummary.summary}</SummaryMarkdown>
                </div>
              </section>
            ) : null}

            {/* Structured Sections (Decisions, Action Items, Key Points) */}
            {parsedSections.map((section) => (
              <section
                key={section.key}
                className="rounded-lg border border-border bg-surface-1 p-5 shadow-xs"
              >
                <h3 className="text-[14px] font-semibold tracking-tight text-ink">
                  {section.title}
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {section.items.map((item, idx) => {
                    const isActionItem = section.key.toLowerCase().includes("action");
                    return (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink/90"
                      >
                        {isActionItem ? (
                          <Square size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
                        ) : (
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                        )}
                        <div>
                          {item.owner ? (
                            <span className="mr-1.5 font-semibold text-ink">
                              [{item.owner}]:
                            </span>
                          ) : null}
                          <span>{item.text}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : entry.body ? (
          /* Plain Markdown Render */
          <div className="rounded-lg border border-border bg-surface-1 p-6 shadow-xs">
            <SummaryMarkdown className="text-[13px] leading-relaxed text-ink">
              {entry.body}
            </SummaryMarkdown>
          </div>
        ) : (
          <div className="py-12 text-center text-[12px] text-ink-muted">
            Summary content is empty.
          </div>
        )}
      </div>
    </div>
  );
}
