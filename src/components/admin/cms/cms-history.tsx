"use client";

/**
 * History for the CMS detail pages.
 *
 *   VersionHistory  published versions of an email or a block: pick one, see what changed field by
 *                   field against the version before it (or against the current draft), restore it
 *                   into the draft.
 *   AuditHistory    every admin write to the item, from the platform audit log — who, when, what,
 *                   and whether it succeeded — with its recorded before/after.
 *   DiffView        a line diff, shared by both.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowCounterClockwise, CheckCircle, ClockCounterClockwise, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { CmsEmptyState } from "@/components/admin/cms/cms-list";
import { useCmsDateFormatter } from "@/components/admin/cms/cms-shared";
import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { useCmsAuditTrail } from "@/hooks/use-cms-audit";
import { useAdminUserDetail } from "@/hooks/use-admin-users";
import { collapseUnchanged, diffLines, diffStats } from "@/lib/admin/text-diff";
import { cn } from "@/lib/utils";
import type { CmsAuditEntryDto, EmailCmsVersionDto } from "@/types/admin-cms";

export function DiffView({ before, after, className }: { before: string; after: string; className?: string }) {
  const t = useTranslations("adminCms.common.history");
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const stats = diffStats(lines);
  const shown = useMemo(() => collapseUnchanged(lines, 2), [lines]);
  if (stats.added === 0 && stats.removed === 0) {
    return <p className={cn("text-[12px] text-ink-subtle", className)}>{t("noChanges")}</p>;
  }
  return (
    <div className={cn("overflow-hidden rounded-md border border-border", className)}>
      <div className="flex gap-3 border-b border-border bg-surface-2 px-3 py-1.5 text-[11px] tabular-nums">
        <span className="text-emerald-700 dark:text-emerald-300">+{stats.added}</span>
        <span className="text-red-700 dark:text-red-300">−{stats.removed}</span>
      </div>
      <pre className="max-h-[420px] overflow-auto font-mono text-[11.5px] leading-[1.6]">
        {shown.map((line, index) =>
          line.op === "gap" ? (
            <div key={index} className="bg-surface-2/60 px-3 text-ink-subtle">
              {t("unchangedLines", { count: line.count })}
            </div>
          ) : (
            <div
              key={index}
              className={cn(
                "whitespace-pre-wrap break-all px-3",
                line.op === "added" && "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
                line.op === "removed" && "bg-red-500/10 text-red-900 line-through decoration-red-500/40 dark:text-red-200",
              )}
            >
              <span className="mr-2 select-none opacity-50">{line.op === "added" ? "+" : line.op === "removed" ? "−" : " "}</span>
              {line.text || " "}
            </div>
          ),
        )}
      </pre>
    </div>
  );
}

function ActorName({ id, fallback }: { id: string | null | undefined; fallback?: string | null }) {
  const user = useAdminUserDetail(fallback ? undefined : (id ?? undefined));
  return <>{fallback || user.data?.user.fullName || user.data?.user.email || (id ? id.slice(0, 8) : "—")}</>;
}

// ── Published versions ──────────────────────────────────────────────────────────────────────

export function VersionHistory({
  versions,
  isLoading,
  isError,
  draftFields,
  fieldLabels,
  onRestore,
  restoring,
}: {
  versions: EmailCmsVersionDto[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /** The current draft, as the same field map, for "compare with draft". */
  draftFields: Record<string, string | null>;
  /** Which fields to compare, in order, with their labels. */
  fieldLabels: readonly { key: string; label: string }[];
  onRestore: (version: number) => void;
  restoring: boolean;
}) {
  const t = useTranslations("adminCms.common.history");
  const formatDate = useCmsDateFormatter();
  const sorted = useMemo(() => [...(versions ?? [])].sort((a, b) => b.version - a.version), [versions]);
  const [selected, setSelected] = useState<number | null>(null);
  const [against, setAgainst] = useState<"previous" | "draft">("previous");

  if (isLoading) return <div className="h-40 animate-pulse rounded-lg bg-surface-2" />;
  if (isError) return <p className="text-[12.5px] text-destructive">{t("loadError")}</p>;
  if (sorted.length === 0) {
    return <CmsEmptyState icon={<ClockCounterClockwise size={18} />} title={t("noVersions")} description={t("noVersionsHint")} />;
  }

  const current = sorted.find((version) => version.version === selected) ?? sorted[0];
  const previous = sorted.find((version) => version.version < current.version);
  const base = against === "draft" ? draftFields : (previous?.fields ?? {});

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <AdminPanel>
        <ul className="max-h-[560px] divide-y divide-border/70 overflow-y-auto">
          {sorted.map((version) => (
            <li key={version.version}>
              <button
                type="button"
                onClick={() => setSelected(version.version)}
                aria-current={version.version === current.version}
                className={cn(
                  "w-full px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                  version.version === current.version && "bg-surface-2",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-ink">v{version.version}</span>
                  <span className="text-[11px] text-ink-subtle">{t(`actions.${versionAction(version.action)}`)}</span>
                </span>
                <span className="mt-0.5 block text-[11.5px] text-ink-muted">
                  {formatDate(version.createdAt)} · <ActorName id={version.createdBy} />
                </span>
                {version.note ? <span className="mt-1 block truncate text-[11.5px] italic text-ink-subtle">“{version.note}”</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </AdminPanel>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-[12px]" role="radiogroup" aria-label={t("compareWith")}>
            {(["previous", "draft"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={against === option}
                onClick={() => setAgainst(option)}
                disabled={option === "previous" && !previous}
                className={cn(
                  "rounded-md px-2.5 py-1 text-ink-muted hover:text-ink disabled:opacity-40",
                  against === option && "bg-surface-2 text-ink",
                )}
              >
                {option === "previous"
                  ? previous
                    ? t("comparePrevious", { version: previous.version })
                    : t("compareFirst")
                  : t("compareDraft")}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={restoring} onClick={() => onRestore(current.version)}>
            <ArrowCounterClockwise size={14} />
            {t("restore", { version: current.version })}
          </Button>
        </div>
        <p className="text-[12px] text-ink-subtle">{t("restoreHint")}</p>
        {fieldLabels.map((field) => {
          const before = against === "draft" ? (current.fields[field.key] ?? "") : (base[field.key] ?? "");
          const after = against === "draft" ? (draftFields[field.key] ?? "") : (current.fields[field.key] ?? "");
          return (
            <section key={field.key}>
              <h4 className="mb-1.5 text-[12px] font-medium text-ink-muted">{field.label}</h4>
              <DiffView before={before ?? ""} after={after ?? ""} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function versionAction(action: string): "published" | "restored" | "reset" | "other" {
  const normalized = action.toLowerCase();
  if (normalized.includes("restore")) return "restored";
  if (normalized.includes("reset")) return "reset";
  if (normalized.includes("publish")) return "published";
  return "other";
}

// ── Audit log ───────────────────────────────────────────────────────────────────────────────

export function AuditHistory({ entityType, entityId }: { entityType: string; entityId: string | undefined }) {
  const t = useTranslations("adminCms.common.history");
  const trail = useCmsAuditTrail(entityType, entityId);
  const formatDate = useCmsDateFormatter();
  const [open, setOpen] = useState<string | null>(null);

  if (!entityId) return null;
  if (trail.isPending) return <div className="h-32 animate-pulse rounded-lg bg-surface-2" />;
  if (trail.isError) {
    return (
      <div className="flex items-center gap-3 text-[12.5px] text-destructive">
        {t("auditError")}
        <Button variant="outline" size="sm" onClick={() => void trail.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (trail.data.length === 0) {
    return <CmsEmptyState icon={<ClockCounterClockwise size={18} />} title={t("noAudit")} description={t("noAuditHint")} />;
  }

  return (
    <AdminPanel>
      <ol className="divide-y divide-border/70">
        {trail.data.map((entry) => (
          <AuditRow
            key={entry.id}
            entry={entry}
            when={formatDate(entry.performedAt)}
            expanded={open === entry.id}
            onToggle={() => setOpen(open === entry.id ? null : entry.id)}
          />
        ))}
      </ol>
      <p className="border-t border-border px-4 py-2.5 text-[11.5px] text-ink-subtle">{t("auditFooter")}</p>
    </AdminPanel>
  );
}

function AuditRow({
  entry,
  when,
  expanded,
  onToggle,
}: {
  entry: CmsAuditEntryDto;
  when: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("adminCms.common.history");
  const failed = entry.result.toLowerCase() !== "succeeded";
  const keys = [...new Set([...Object.keys(entry.beforeSummary ?? {}), ...Object.keys(entry.afterSummary ?? {})])].filter(
    (key) => (entry.beforeSummary?.[key] ?? "") !== (entry.afterSummary?.[key] ?? ""),
  );
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        {failed ? (
          <WarningCircle size={16} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
        ) : (
          <CheckCircle size={16} weight="duotone" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink">
            <span className="font-medium">
              <ActorName id={entry.actor?.id} fallback={entry.actor?.name ?? entry.actor?.email} />
            </span>{" "}
            <span className="font-mono text-[12px] text-ink-muted">{entry.action}</span>
            {entry.entity?.label ? <span className="text-ink-muted"> · {entry.entity.label}</span> : null}
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-subtle">
            {when}
            {failed ? ` · ${t("failed")}${entry.errorMessage ? `: ${entry.errorMessage}` : ""}` : ""}
            {entry.reason ? ` · ${entry.reason}` : ""}
          </p>
        </div>
        {keys.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? t("hideChanges") : t("showChanges", { count: keys.length })}
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <div className="mt-3 space-y-3 pl-7">
          {keys.map((key) => (
            <section key={key}>
              <h5 className="mb-1 font-mono text-[11px] text-ink-muted">{key}</h5>
              <DiffView before={entry.beforeSummary?.[key] ?? ""} after={entry.afterSummary?.[key] ?? ""} />
            </section>
          ))}
        </div>
      ) : null}
    </li>
  );
}
