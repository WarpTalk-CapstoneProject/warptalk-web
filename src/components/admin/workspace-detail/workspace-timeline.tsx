"use client";

import {
  ArrowSquareOut,
  ClockCounterClockwise,
  NotePencil,
  Prohibit,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAdminWorkspaceTimeline } from "@/hooks/use-admin-workspace-actions";
import { timelineActionKey } from "@/lib/admin/workspace-actions";
import { cn } from "@/lib/utils";
import type { AdminWorkspaceTimelineEntryDto } from "@/types/admin-workspace-actions";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "credits_remaining: 100 → 350" — the before/after the audit entry carries, key by key. */
function describeChange(entry: AdminWorkspaceTimelineEntryDto): string | null {
  const keys = new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})]);
  const parts = [...keys].map((key) => {
    const before = entry.before?.[key];
    const after = entry.after?.[key];
    if (before !== undefined && after !== undefined && before !== after) return `${key}: ${before} → ${after}`;
    return `${key}: ${after ?? before}`;
  });
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * Everything that has been done to this workspace, by whom and why: every service's audit entries
 * stamped with it (lifecycle, credits, plan, invoices, sign-outs, notices, exports) interleaved with
 * the internal notes. Read-only — the store under it is append-only.
 */
export function WorkspaceTimeline({ workspaceId, onAddNote }: { workspaceId: string; onAddNote: () => void }) {
  const t = useTranslations("adminWorkspaces.timeline");
  const timelineQuery = useAdminWorkspaceTimeline(workspaceId);
  const entries = timelineQuery.data ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-linear">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{t("heading")}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* The same entries, in the platform log: full filters, request details and CSV. */}
          <Link
            href={`/admin/audit?range=all&workspace=${encodeURIComponent(workspaceId)}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowSquareOut size={14} />
            {t("openInAuditLog")}
          </Link>
          <Button variant="outline" size="sm" onClick={onAddNote}>
            <NotePencil size={14} />
            {t("addNote")}
          </Button>
        </div>
      </div>

      {timelineQuery.isError ? (
        <div className="flex items-start gap-3 px-4 py-6 text-sm">
          <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">{t("errorText")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void timelineQuery.refetch()}>
              {t("tryAgain")}
            </Button>
          </div>
        </div>
      ) : timelineQuery.isPending ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
            <ClockCounterClockwise size={20} weight="duotone" />
          </span>
          <p className="mt-3 text-sm font-medium text-ink">{t("emptyTitle")}</p>
          <p className="mt-1 text-xs text-ink-muted">{t("emptyDescription")}</p>
        </div>
      ) : (
        <ol>
          {entries.map((entry) => {
            const isNote = entry.kind === "note";
            const failed = entry.result === "failed";
            const key = timelineActionKey(entry.action);
            const destructive = entry.action === "suspend" || entry.action === "delete";
            const change = isNote ? null : describeChange(entry);
            return (
              <li key={`${entry.kind}-${entry.id}`} className="flex gap-3 border-b border-hairline/60 px-4 py-3 last:border-b-0">
                <span
                  className={cn(
                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                    isNote
                      ? "bg-sky-500/10 text-sky-600"
                      : failed || destructive
                        ? "bg-destructive/10 text-destructive"
                        : "bg-emerald-500/10 text-emerald-600",
                  )}
                >
                  {isNote ? (
                    <NotePencil size={14} weight="duotone" />
                  ) : failed || destructive ? (
                    <Prohibit size={14} weight="duotone" />
                  ) : (
                    <ShieldCheck size={14} weight="duotone" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">
                    {isNote ? t("note") : t(`actions.${key}`)}
                    {!isNote && key === "other" ? (
                      <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-subtle">{entry.action}</span>
                    ) : null}
                    {failed ? (
                      <span className="ml-2 rounded-full border border-destructive/25 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                        {t("failed")}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-5 text-ink-muted">{entry.text}</p>
                  {change ? <p className="mt-1 break-words font-mono text-[11px] text-ink-subtle">{change}</p> : null}
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    {t("byline", {
                      date: dateTimeFormatter.format(new Date(entry.at)),
                      actor: entry.actorName ?? entry.actorId,
                    })}
                    {entry.sourceService ? ` · ${entry.sourceService}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
