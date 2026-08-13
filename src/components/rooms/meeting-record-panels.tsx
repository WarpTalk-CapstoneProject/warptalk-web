"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ChatCircleText,
  CheckCircle,
  CheckSquare,
  Copy,
  DownloadSimple,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import {
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
} from "@/lib/meeting/meeting-artifacts";
import {
  DEFAULT_SUMMARY_TEMPLATE,
  SUMMARY_TEMPLATES,
  formatCitationTime,
} from "@/lib/meeting/meeting-summary";
import { translationRoomService } from "@/services/translation-room.service";
import type {
  EndedRoomHistoryItem,
  RoomHistoryArtifact,
} from "@/types/roomHistory";

/**
 * The AI summary and the retained files for one meeting.
 *
 * These used to live on a separate Transcripts page, one level removed from the meeting they
 * describe: to read what a meeting decided you left the meeting's own page, found it again in
 * a workspace-wide queue, and picked a tab. A meeting's transcript, its summary and its files
 * are three views of one thing, so they now sit together on that meeting's page and this
 * component is what moved.
 */

/** A tab in the meeting record. Shared so the three tabs cannot drift apart visually. */
export function MeetingRecordTabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-10 items-center gap-1.5 border-b-2 px-3 text-[12px] font-medium transition-colors",
        active
          ? "border-ink text-ink"
          : "border-transparent text-ink-muted hover:text-ink",
      )}
    >
      <Icon size={14} />
      {label}
      {typeof count === "number" ? (
        <span className="text-[10px] text-ink-subtle">({count})</span>
      ) : null}
    </button>
  );
}

/**
 * Downloading an artifact, including the consent stop.
 *
 * Consent is asked for and recorded before the file is fetched, and the caller is told to
 * refetch afterwards so the row stops saying "Consent required" once it no longer is.
 */
export function useArtifactDownload(onConsentGranted?: () => void) {
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);

  async function downloadArtifact(artifact: RoomHistoryArtifact) {
    if (!canDownloadArtifact(artifact)) {
      toast.error("This file is not ready to download.");
      return;
    }

    setBusyArtifactId(artifact.id);
    try {
      if (artifact.consentRequired) {
        await translationRoomService.approveArtifactConsent(artifact.id);
      }
      const { data } = await translationRoomService.artifactDownload(
        artifact.id,
      );
      openArtifactDownload(data);
      if (artifact.consentRequired) onConsentGranted?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not download this file.",
      );
    } finally {
      setBusyArtifactId(null);
    }
  }

  return { busyArtifactId, downloadArtifact };
}

/**
 * True for a while after a meeting ends.
 *
 * The summary is generated asynchronously, so the gap between "ended" and "summary exists" is
 * normal rather than a failure — during that window the panel says it is being generated
 * instead of claiming there is none.
 */
export function useRecentlyEnded(
  endedAt: string | null | undefined,
  windowMs = 10 * 60 * 1000,
): boolean {
  const [observedNow, setObservedNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setObservedNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!endedAt) return false;
  const ended = new Date(endedAt).getTime();
  if (Number.isNaN(ended)) return false;
  return observedNow - ended < windowMs;
}

function SummaryGeneratingText() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let context: { revert: () => void } | null = null;
    let cancelled = false;

    void import("gsap").then(({ gsap }) => {
      if (cancelled || !rootRef.current) return;

      context = gsap.context(() => {
        gsap.fromTo(
          ".summary-generating-bar",
          { opacity: 0.28 },
          {
            opacity: 0.62,
            duration: 1.2,
            ease: "sine.inOut",
            stagger: 0.08,
            repeat: -1,
            yoyo: true,
          },
        );
        gsap.fromTo(
          ".summary-generating-shimmer",
          { xPercent: -180 },
          {
            xPercent: 220,
            duration: 1.45,
            ease: "none",
            stagger: 0.06,
            repeat: -1,
          },
        );
      }, rootRef);
    });

    return () => {
      cancelled = true;
      context?.revert();
    };
  }, []);

  const overviewWidths = [
    "w-[88%]",
    "w-[96%]",
    "w-[72%]",
  ];
  const sectionWidths = [
    "w-[64%]",
    "w-[78%]",
    "w-[58%]",
    "w-[84%]",
    "w-[70%]",
    "w-[52%]",
  ];

  return (
    <div
      ref={rootRef}
      className="flex-1 space-y-7 p-6"
      role="status"
      aria-live="polite"
      aria-label="AI is generating the summary"
    >
      <span className="sr-only">AI is generating the summary.</span>
      <div className="space-y-3" aria-hidden="true">
        {overviewWidths.map((width, index) => (
          <div
            key={`overview-${index}`}
            className={cn(
              "summary-generating-bar relative h-3 overflow-hidden rounded-full bg-neutral-500/15 dark:bg-neutral-500/20",
              width,
            )}
          >
            <span className="summary-generating-shimmer absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-neutral-200/45 to-transparent dark:via-neutral-200/35" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
        {sectionWidths.map((width, index) => (
          <div
            key={`section-${index}`}
            className="flex items-center gap-2"
          >
            <span className="size-3 shrink-0 rounded-sm border border-neutral-500/15 bg-neutral-500/10" />
            <span
              className={cn(
                "summary-generating-bar relative h-2.5 overflow-hidden rounded-full bg-neutral-500/15 dark:bg-neutral-500/20",
                width,
              )}
            >
              <span className="summary-generating-shimmer absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-neutral-200/40 to-transparent dark:via-neutral-200/30" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SummaryPanel({
  room,
  busyArtifactId,
  onDownload,
  onJumpToMoment,
  onRewrite,
  forceGenerating = false,
}: {
  room: EndedRoomHistoryItem;
  busyArtifactId: string | null;
  onDownload: (artifact: RoomHistoryArtifact) => void;
  /** Open the transcript at the moment a summary item cites. Omit to render items as
   *  plain text — which is also what happens for a summary written before citations. */
  onJumpToMoment?: (atMs: number) => void;
  /** Ask for the summary to be rewritten in another shape. Omit to hide the picker. */
  onRewrite?: (templateKey: string) => Promise<void>;
  /** Local preview switch for visually checking the AI-writing state without backend timing. */
  forceGenerating?: boolean;
}) {
  const artifact = room.artifacts.find(
    (item) => item.type === "summary_export",
  );
  const summary = room.summary;
  const ready = artifact?.status === "ready";
  const busy = busyArtifactId === artifact?.id;
  const hasStructuredContent = Boolean(
    summary &&
      !summary.insufficientData &&
      (summary.summary || summary.decisions.length || summary.actionItems.length),
  );
  const recentlyEnded = useRecentlyEnded(room.endedAt);

  const currentTemplate = summary?.templateKey ?? DEFAULT_SUMMARY_TEMPLATE;
  const [requestedTemplate, setRequestedTemplate] = useState<string | null>(null);
  const isRewriting = requestedTemplate !== null && requestedTemplate !== currentTemplate;
  const isGenerating =
    forceGenerating ||
    isRewriting ||
    artifact?.status === "processing" ||
    (!artifact && recentlyEnded);

  useEffect(() => {
    // A rewrite that never lands must not leave the picker spinning forever — the summary
    // arrives on the artifact asynchronously, and "still waiting" and "never coming" look
    // identical without a deadline.
    if (!isRewriting) return;
    const timer = window.setTimeout(() => {
      setRequestedTemplate(null);
      toast.error("The rewritten summary has not arrived. Try again.");
    }, 90_000);
    return () => window.clearTimeout(timer);
  }, [isRewriting]);

  async function copyAsText() {
    if (!summary) return;
    const lines = [
      `${room.title} — AI meeting summary`,
      "",
      "Overview",
      summary.summary || "(no overview)",
      "",
      "Decisions",
      ...(summary.decisions.length
        ? summary.decisions.map((decision) => `- ${decision}`)
        : ["(none recorded)"]),
      "",
      "Action items",
      ...(summary.actionItems.length
        ? summary.actionItems.map(
            (action) =>
              `- [ ] ${action.owner ? `${action.owner}: ` : ""}${action.task}`,
          )
        : ["(none recorded)"]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Summary copied to clipboard.");
    } catch {
      toast.error("Could not copy the summary.");
    }
  }

  return (
    <div className="flex min-h-[320px] flex-col border border-border bg-canvas">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-[10px] font-medium text-ink-subtle">
          SUMMARY OUTPUT
        </span>
        <span className="flex items-center gap-3">
          {onRewrite ? (
            <select
              value={isRewriting ? (requestedTemplate as string) : currentTemplate}
              disabled={isRewriting}
              onChange={async (event) => {
                const templateKey = event.target.value;
                if (templateKey === currentTemplate) return;
                setRequestedTemplate(templateKey);
                try {
                  await onRewrite(templateKey);
                } catch {
                  setRequestedTemplate(null);
                }
              }}
              aria-label="Summary shape"
              title="Rewrite this summary in a different shape"
              className="h-6 rounded border border-border bg-surface-1 px-1 text-[10px] text-ink disabled:opacity-60"
            >
              {SUMMARY_TEMPLATES.map((template) => (
                <option key={template.key} value={template.key} title={template.description}>
                  {template.label}
                </option>
              ))}
            </select>
          ) : null}
          {isRewriting ? (
            <span className="flex items-center gap-1 text-[10px] text-ink-subtle">
              <SpinnerGap size={12} className="animate-spin" /> Rewriting…
            </span>
          ) : null}
          <span className="text-[10px] text-ink-subtle">
            {artifact?.format || "No file"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!hasStructuredContent}
            onClick={copyAsText}
            className="h-6 rounded px-2 text-[10px] shadow-none"
          >
            <Copy size={12} /> Copy
          </Button>
        </span>
      </div>

      {isGenerating ? (
        <SummaryGeneratingText />
      ) : hasStructuredContent && summary ? (
        <div className="flex-1 space-y-6 p-6">
          <section>
            <h3 className="text-[11px] font-semibold uppercase text-ink-subtle">
              Overview
            </h3>
            <p className="mt-2 text-[12px] leading-6 text-ink">
              {summary.summary}
            </p>
          </section>

          {/* Sections come from the template the assistant used, so a standup shows
              blockers and an interview shows concerns, rather than every meeting being
              forced into decisions-and-action-items. */}
          {(summary.sections ?? []).map((section) => (
            <section key={section.key}>
              <h3 className="text-[11px] font-semibold uppercase text-ink-subtle">
                {section.title}
              </h3>
              <ul className="mt-2 space-y-2">
                {section.items.map((item, index) => (
                  <li
                    key={`${section.key}-${index}`}
                    className="flex items-start gap-2 text-[12px] leading-5 text-ink"
                  >
                    <CheckSquare
                      size={14}
                      className="mt-0.5 shrink-0 text-ink-subtle"
                    />
                    <span className="min-w-0">
                      {item.owner ? (
                        <span className="font-medium">{item.owner}: </span>
                      ) : null}
                      {item.text}
                      {/* The evidence. A claim the assistant could not anchor to a moment
                          has no button here, which is itself the signal worth seeing. */}
                      {item.atMs !== null && onJumpToMoment ? (
                        <button
                          type="button"
                          onClick={() => onJumpToMoment(item.atMs as number)}
                          title="Jump to this moment in the transcript"
                          className="ml-1.5 inline-flex shrink-0 items-center rounded border border-border px-1 py-px align-baseline font-mono text-[10px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          {formatCitationTime(item.atMs)}
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {/* The hardcoded Decisions and Action items blocks are gone: both eras of
              summary now arrive as `sections`, so rendering them again here printed every
              decision twice. */}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div className="max-w-[360px]">
            <ChatCircleText size={28} className="mx-auto text-ink-muted" />
            <h3 className="mt-4 text-[15px] font-semibold">
              No summary output
            </h3>
            <p className="mt-2 text-[11px] leading-5 text-ink-muted">
              {summary?.insufficientData
                  ? "There wasn't enough transcript content in this meeting to generate a summary."
                  : "This meeting ended without a summary artifact."}
            </p>
          </div>
        </div>
      )}

      {artifact ? (
        <div className="border-t border-border p-4">
          <Button
            size="sm"
            variant={ready ? "default" : "outline"}
            disabled={!ready || busy}
            onClick={() => onDownload(artifact)}
            className="h-8 rounded-md text-[11px] shadow-none"
          >
            {busy ? (
              <SpinnerGap size={14} className="animate-spin" />
            ) : (
              <DownloadSimple size={14} />
            )}{" "}
            Download summary file
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ArtifactsPanel({
  artifacts,
  busyArtifactId,
  onDownload,
}: {
  artifacts: RoomHistoryArtifact[];
  busyArtifactId: string | null;
  onDownload: (artifact: RoomHistoryArtifact) => void;
}) {
  if (!artifacts.length) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center border border-border bg-canvas p-8 text-center">
        <Archive size={28} className="text-ink-muted" />
        <h3 className="mt-4 text-[15px] font-semibold">No retained artifacts</h3>
        <p className="mt-2 max-w-[360px] text-[11px] leading-5 text-ink-muted">
          Nothing has been generated or retained for this meeting yet.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[320px] border border-border bg-canvas">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-[10px] font-medium text-ink-subtle">
          RETAINED ARTIFACTS
        </span>
        <span className="text-[10px] text-ink-subtle">{artifacts.length}</span>
      </div>
      <div className="divide-y divide-border">
        {artifacts.map((artifact) => (
          <button
            key={artifact.id}
            type="button"
            disabled={busyArtifactId === artifact.id}
            onClick={() => onDownload(artifact)}
            className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/55 disabled:opacity-50"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface-1">
              <ArtifactIcon artifact={artifact} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-ink">
                {artifact.title || artifactLabel(artifact.type)}
              </span>
              <span className="mt-0.5 block text-[10px] text-ink-subtle">
                {artifactLabel(artifact.type)} · {artifact.format || "—"} ·{" "}
                {artifactStatusLabel(artifact)}
              </span>
            </span>
            {busyArtifactId === artifact.id ? (
              <SpinnerGap size={14} className="animate-spin text-ink-muted" />
            ) : (
              <DownloadSimple
                size={14}
                className="text-ink-subtle transition-colors group-hover:text-ink"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ArtifactIcon({ artifact }: { artifact: RoomHistoryArtifact }) {
  if (artifact.status === "processing")
    return <SpinnerGap size={14} className="animate-spin text-ink-muted" />;
  if (["failed", "missing", "expired"].includes(artifact.status))
    return <WarningCircle size={14} className="text-ink-muted" />;
  return <CheckCircle size={14} className="text-primary" />;
}
