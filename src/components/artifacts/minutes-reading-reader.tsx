"use client";

import { useState } from "react";
import {
  Copy,
  DownloadSimple,
  Signature,
  Stamp,
  Users,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { SummaryMarkdown } from "@/components/markdown/document-markdown";
import { describeAbsence } from "@/lib/meeting/artifact-library";
import type { LibraryEntry } from "@/lib/meeting/artifact-library";

export function MinutesReadingReader({
  entry,
  roomId,
}: {
  entry: LibraryEntry;
  roomId: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMinutes() {
    if (!entry.body) return;
    try {
      await navigator.clipboard.writeText(entry.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Minutes copied to clipboard");
    } catch {
      toast.error("Could not copy minutes");
    }
  }

  function downloadMinutes() {
    if (!entry.body) return;
    const blob = new Blob([entry.body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `minutes-${roomId}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Minutes downloaded");
  }

  if (entry.absence) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-5">
          <Stamp size={20} className="mt-0.5 text-ink-subtle" />
          <div>
            <h3 className="text-[13px] font-medium text-ink">Minutes unavailable</h3>
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
            <Stamp size={13} className="text-emerald-500" />
            <span>Meeting Minutes</span>
          </span>

          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            {entry.statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copyMinutes}
            className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <Copy size={13} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={downloadMinutes}
            className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <DownloadSimple size={13} />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Main Document Body */}
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
        {/* Formal Signatures & Reviewers Banner */}
        {entry.secretaryName || entry.chairName ? (
          <div className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-2 p-4 sm:grid-cols-3">
            {entry.secretaryName ? (
              <div className="flex items-center gap-2">
                <Signature size={15} className="text-ink-subtle" />
                <div>
                  <span className="block text-[10px] text-ink-subtle">Secretary</span>
                  <span className="text-[12px] font-medium text-ink">{entry.secretaryName}</span>
                </div>
              </div>
            ) : null}

            {entry.chairName ? (
              <div className="flex items-center gap-2">
                <Signature size={15} className="text-ink-subtle" />
                <div>
                  <span className="block text-[10px] text-ink-subtle">Approved by Chair</span>
                  <span className="text-[12px] font-medium text-ink">{entry.chairName}</span>
                </div>
              </div>
            ) : null}

            {typeof entry.editCountVsDraft === "number" ? (
              <div className="flex items-center gap-2">
                <Users size={15} className="text-ink-subtle" />
                <div>
                  <span className="block text-[10px] text-ink-subtle">Edits before signing</span>
                  <span className="text-[12px] font-medium text-ink">{entry.editCountVsDraft}</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Minutes Official Text */}
        {entry.body ? (
          <article className="rounded-lg border border-border bg-surface-1 p-6 shadow-xs">
            <SummaryMarkdown className="text-[13px] leading-relaxed text-ink">
              {entry.body}
            </SummaryMarkdown>
          </article>
        ) : (
          <div className="py-12 text-center text-[12px] text-ink-muted">
            Minutes content is empty.
          </div>
        )}
      </div>
    </div>
  );
}
