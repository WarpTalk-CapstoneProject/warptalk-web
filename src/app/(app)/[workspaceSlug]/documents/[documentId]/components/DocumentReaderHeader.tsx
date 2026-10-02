"use client";

/**
 * The top of the document reader, laid out like the Records reader (`ArtifactRecordHeader`):
 * back link, title with its actions, a one-line meta bar, then the version tabs.
 *
 * The version tabs exist only for a caller who holds the original AND may see the masked copy —
 * Owner/Admin and the uploader — so they can check exactly what members are shown. An ordinary
 * member has one version and gets no tabs; the meta bar says the document is masked instead.
 */

import {
  ArrowLeft,
  CalendarBlank,
  EyeSlash,
  FileText,
  HardDrives,
  ShieldWarning,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { DocumentVersion } from "@/lib/documents/document-masking";
import { cn } from "@/lib/utils";

export function DocumentReaderHeader({
  title,
  backLabel,
  onBack,
  actions,
  fileExtension,
  sizeLabel,
  uploadedAt,
  restrictedLabel,
  version,
  versionTabs,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  actions: ReactNode;
  fileExtension: string;
  sizeLabel: string;
  uploadedAt: string;
  /** Shown as a chip when the scan restricted the document; null when it did not. */
  restrictedLabel: string | null;
  version: DocumentVersion | null;
  /** Present only when the caller can switch between the original and the masked copy. */
  versionTabs: {
    label: string;
    originalLabel: string;
    maskedLabel: string;
    onSelect: (version: DocumentVersion) => void;
  } | null;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border bg-surface-1 px-5 py-3.5">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{backLabel}</span>
      </button>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="min-w-0 truncate text-[18px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1">
          <FileText size={12} className="text-ink-subtle" />
          <span className="font-mono">
            {fileExtension.replace(".", "").toUpperCase() || "FILE"}
          </span>
        </span>
        <span aria-hidden className="text-ink-subtle">·</span>
        <span className="flex items-center gap-1">
          <HardDrives size={12} className="text-ink-subtle" />
          <span>{sizeLabel}</span>
        </span>
        <span aria-hidden className="text-ink-subtle">·</span>
        <span className="flex items-center gap-1">
          <CalendarBlank size={12} className="text-ink-subtle" />
          <span>{formatDateTime(uploadedAt)}</span>
        </span>
        {restrictedLabel ? (
          <>
            <span aria-hidden className="text-ink-subtle">·</span>
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
              {version === "masked" ? <EyeSlash size={12} /> : <ShieldWarning size={12} />}
              <span>{restrictedLabel}</span>
            </span>
          </>
        ) : null}
      </div>

      {versionTabs ? (
        <div
          role="tablist"
          aria-label={versionTabs.label}
          className="mt-1 flex items-center gap-1.5 pt-1"
        >
          {(["original", "masked"] as const).map((candidate) => {
            const active = candidate === version;
            return (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => versionTabs.onSelect(candidate)}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-ink bg-ink text-surface-1 shadow-sm"
                    : "border-border bg-surface-2 text-ink-muted hover:border-ink-subtle hover:text-ink",
                )}
              >
                {candidate === "original" ? (
                  <FileText size={12} weight={active ? "bold" : "regular"} className="shrink-0" />
                ) : (
                  <EyeSlash size={12} weight={active ? "bold" : "regular"} className="shrink-0" />
                )}
                <span className="truncate">
                  {candidate === "original" ? versionTabs.originalLabel : versionTabs.maskedLabel}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
