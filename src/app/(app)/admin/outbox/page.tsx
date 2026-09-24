"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  CheckCircle,
  Copy,
  Tray,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminOutboxDeadLetters, useReplayOutboxEvent } from "@/hooks/use-admin-outbox";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { WorkspaceOutboxDeadLetterDto } from "@/types/admin-outbox";

/** The controller clamps to 1..500 and defaults to 100; newest dead letters first. */
const LIMIT = 100;
const numberFormatter = new Intl.NumberFormat("en-US");

function formatWhen(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

async function copyText(value: string, successMessage: string, failureMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error(failureMessage);
  }
}

export default function AdminOutboxPage() {
  const t = useTranslations("adminOps.outbox");
  const deadLettersQuery = useAdminOutboxDeadLetters(LIMIT);
  const replay = useReplayOutboxEvent();
  const [pending, setPending] = useState<WorkspaceOutboxDeadLetterDto | null>(null);

  const items = deadLettersQuery.data ?? [];

  const confirmReplay = async () => {
    if (!pending) return;
    try {
      await replay.mutateAsync(pending.id);
      toast.success(t("replaySuccess", { eventType: pending.eventType }));
      setPending(null);
    } catch (error) {
      toast.error(getErrorMessage(error, t("replayErrorFallback")));
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Tray size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-3">
            {deadLettersQuery.data ? (
              <span className="text-[12px] text-ink-muted">
                {items.length >= LIMIT
                  ? t("latestShown", { limit: numberFormatter.format(LIMIT) })
                  : t("deadLetteredCount", { count: numberFormatter.format(items.length) })}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void deadLettersQuery.refetch()}
              disabled={deadLettersQuery.isFetching}
            >
              <ArrowsClockwise
                size={14}
                className={cn(deadLettersQuery.isFetching && "animate-spin")}
              />
              {t("refresh")}
            </Button>
          </div>
        }
      />

      <AdminPanel className="mt-5">
        {deadLettersQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("errorTitle")}</p>
              <p className="mt-1 text-ink-muted">
                {getErrorMessage(deadLettersQuery.error, t("errorFallback"))}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void deadLettersQuery.refetch()}
              >
                {t("tryAgain")}
              </Button>
            </div>
          </div>
        ) : deadLettersQuery.isPending ? (
          <ul>
            {Array.from({ length: 5 }).map((_, index) => (
              <li key={index} className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
                <div className="h-3 w-72 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="grid place-items-center px-4 py-14 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <CheckCircle size={20} weight="duotone" />
              </span>
              <p className="mt-3 text-sm font-medium">{t("emptyTitle")}</p>
              <p className="mt-1 text-xs text-ink-muted">{t("emptyDescription")}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-[11px] font-medium text-ink-muted">
                  <th className="px-4 py-2 font-medium">{t("columnDeadLettered")}</th>
                  <th className="px-4 py-2 font-medium">{t("columnEvent")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("columnAttempts")}</th>
                  <th className="px-4 py-2 font-medium">{t("columnWorkspace")}</th>
                  <th className="px-4 py-2 font-medium">{t("columnLastError")}</th>
                  <th className="px-4 py-2 font-medium">{t("columnCorrelation")}</th>
                  <th className="px-4 py-2" aria-label={t("columnActions")} />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <DeadLetterRow
                    key={item.id}
                    item={item}
                    onReplay={() => setPending(item)}
                    isReplaying={replay.isPending && replay.variables === item.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !replay.isPending) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("replayDialogTitle")}</DialogTitle>
            <DialogDescription>{t("replayDialogDescription")}</DialogDescription>
          </DialogHeader>
          {pending ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 rounded-md border border-hairline bg-surface-2 px-3 py-2.5 text-[12px]">
              <dt className="text-ink-muted">{t("dialogEventLabel")}</dt>
              <dd className="break-all font-mono text-ink">
                {pending.eventType} v{pending.schemaVersion}
              </dd>
              <dt className="text-ink-muted">{t("dialogAttemptsLabel")}</dt>
              <dd className="text-ink">{numberFormatter.format(pending.attemptCount)}</dd>
              <dt className="text-ink-muted">{t("dialogEventIdLabel")}</dt>
              <dd className="break-all font-mono text-ink">{pending.id}</dd>
            </dl>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPending(null)}
              disabled={replay.isPending}
            >
              {t("cancel")}
            </Button>
            <Button onClick={() => void confirmReplay()} disabled={replay.isPending}>
              <ArrowCounterClockwise size={14} />
              {replay.isPending ? t("replaying") : t("replayEvent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}

function DeadLetterRow({
  item,
  onReplay,
  isReplaying,
}: {
  item: WorkspaceOutboxDeadLetterDto;
  onReplay: () => void;
  isReplaying: boolean;
}) {
  const t = useTranslations("adminOps.outbox");
  const [expanded, setExpanded] = useState(false);

  return (
    <tr className="border-b border-hairline/60 align-top last:border-b-0">
      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-ink-muted">
        {formatWhen(item.deadLetteredAt)}
      </td>
      <td className="px-4 py-3">
        <p className="font-mono text-[12px] text-ink">{item.eventType}</p>
        <p className="text-[11px] text-ink-subtle">
          {t("schemaVersion", { version: item.schemaVersion })}
        </p>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink">
        {numberFormatter.format(item.attemptCount)}
      </td>
      <td className="px-4 py-3">
        {/* The detail route takes an id as well as a slug and swaps the address bar to the slug
            once it resolves, so linking by id here does not leave an id in the URL. */}
        {item.workspaceId ? (
          <Link
            href={`/admin/workspaces/${item.workspaceId}`}
            className="font-mono text-[12px] text-ink underline-offset-2 hover:underline"
            title={item.workspaceId}
          >
            {item.workspaceId.slice(0, 8)}…
          </Link>
        ) : (
          <span className="text-[12px] text-ink-subtle">—</span>
        )}
      </td>
      <td className="max-w-[360px] px-4 py-3">
        {item.lastError ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className={cn(
              "block w-full text-left font-mono text-[11px] text-ink-muted hover:text-ink",
              expanded ? "whitespace-pre-wrap break-words" : "truncate",
            )}
            title={expanded ? t("collapseError") : t("showFullError")}
          >
            {item.lastError}
          </button>
        ) : (
          <span className="text-[12px] text-ink-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {item.correlationId ? (
          <button
            type="button"
            onClick={() =>
              void copyText(
                item.correlationId!,
                t("copiedToast", { label: t("correlationIdLabel") }),
                t("copyFailedToast", { label: t("correlationIdLabel").toLowerCase() }),
              )
            }
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-muted hover:text-ink"
            title={item.correlationId}
          >
            {item.correlationId.slice(0, 8)}…
            <Copy size={12} />
          </button>
        ) : (
          <span className="text-[12px] text-ink-subtle">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <Button variant="outline" size="sm" onClick={onReplay} disabled={isReplaying}>
          <ArrowCounterClockwise size={14} />
          {t("replay")}
        </Button>
      </td>
    </tr>
  );
}
