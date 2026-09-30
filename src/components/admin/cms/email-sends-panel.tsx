"use client";

/**
 * The send log of a custom template: every audience send (by an admin, or with an announcement),
 * its progress, and each recipient's outcome — sent, failed (the provider refused it) or skipped
 * (opted out, or the send was cancelled). Refreshes itself while a send is queued or running.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CaretLeft, Megaphone, PaperPlaneTilt, Prohibit } from "@phosphor-icons/react/dist/ssr";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { useConfirm } from "@/components/admin/cms/cms-editor";
import { CmsEmptyState } from "@/components/admin/cms/cms-list";
import { CHIP_TONES, CmsChip, useCmsDateFormatter } from "@/components/admin/cms/cms-shared";
import { Button } from "@/components/ui/button";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { useCancelEmailSend, useEmailSendRecipients, useEmailSends } from "@/hooks/use-admin-email-sends";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { EmailCampaignDto } from "@/types/admin-cms";

const STATUS_TONE: Record<string, string> = {
  QUEUED: CHIP_TONES.info,
  SENDING: CHIP_TONES.accent,
  COMPLETED: CHIP_TONES.positive,
  CANCELLED: CHIP_TONES.neutral,
  FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
};

const RECIPIENT_FILTERS = ["", "SENT", "FAILED", "SKIPPED", "PENDING"] as const;

export function EmailSendsPanel({ templateKey, canSend, onNewSend }: { templateKey: string; canSend: boolean; onNewSend?: () => void }) {
  const t = useTranslations("adminCms.library.sends");
  const sends = useEmailSends(templateKey, canSend);
  const [open, setOpen] = useState<string | null>(null);

  if (!canSend) return <CmsEmptyState icon={<Prohibit size={18} />} title={t("noPermission")} description={t("noPermissionHint")} />;
  if (sends.isPending) return <div className="h-40 animate-pulse rounded-lg bg-surface-2" />;
  if (sends.isError) return <p className="text-[12.5px] text-destructive">{getErrorMessage(sends.error, t("loadError"))}</p>;

  const selected = sends.data.find((send) => send.id === open);
  if (selected) return <SendDetail send={selected} onBack={() => setOpen(null)} />;

  if (sends.data.length === 0) {
    return (
      <CmsEmptyState
        icon={<PaperPlaneTilt size={18} />}
        title={t("empty")}
        description={t("emptyHint")}
        action={
          onNewSend ? (
            <Button size="sm" onClick={onNewSend}>
              <PaperPlaneTilt size={14} />
              {t("newSend")}
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <AdminPanel>
      <ul className="divide-y divide-border/70">
        {sends.data.map((send) => (
          <li key={send.id}>
            <button type="button" onClick={() => setOpen(send.id)} className="w-full px-4 py-3 text-left hover:bg-surface-2/60">
              <SendSummary send={send} />
            </button>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}

function SendSummary({ send }: { send: EmailCampaignDto }) {
  const t = useTranslations("adminCms.library.sends");
  const formatDate = useCmsDateFormatter();
  const done = send.sent + send.failed + send.skipped;
  const percent = send.total > 0 ? Math.round((done / send.total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CmsChip className={STATUS_TONE[send.status] ?? CHIP_TONES.neutral}>{t(`statuses.${send.status}`)}</CmsChip>
        {send.source === "ANNOUNCEMENT" ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-muted">
            <Megaphone size={12} /> {t("fromAnnouncement")}
          </span>
        ) : null}
        <span className="text-[12px] text-ink-muted">
          {send.status === "QUEUED" ? t("scheduledFor", { date: formatDate(send.scheduledAt) }) : t("startedAt", { date: formatDate(send.startedAt ?? send.createdAt) })}
        </span>
        <span className="ml-auto text-[12px] tabular-nums text-ink-muted">
          {t("counts", { sent: send.sent, failed: send.failed, skipped: send.skipped, total: send.total })}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="flex h-full" style={{ width: `${percent}%` }}>
          <span className="h-full bg-emerald-500" style={{ flex: send.sent || 0 }} />
          <span className="h-full bg-destructive" style={{ flex: send.failed || 0 }} />
          <span className="h-full bg-ink-subtle/50" style={{ flex: send.skipped || 0 }} />
        </div>
      </div>
      {send.error ? <p className="text-[12px] text-destructive">{send.error}</p> : null}
    </div>
  );
}

function SendDetail({ send, onBack }: { send: EmailCampaignDto; onBack: () => void }) {
  const t = useTranslations("adminCms.library.sends");
  const tCommon = useTranslations("adminCms.common");
  const formatDate = useCmsDateFormatter();
  const [status, setStatus] = useState<(typeof RECIPIENT_FILTERS)[number]>("");
  const [page, setPage] = useState(1);
  const live = send.status === "QUEUED" || send.status === "SENDING";
  const recipients = useEmailSendRecipients(send.id, status || null, page, live);
  const cancel = useCancelEmailSend();
  const [confirm, confirmDialog] = useConfirm();
  const totalPages = Math.max(1, Math.ceil((recipients.data?.total ?? 0) / 50));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <CaretLeft size={14} />
          {t("back")}
        </Button>
        {live ? (
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto"
            disabled={cancel.isPending}
            onClick={() =>
              confirm({
                title: t("cancelTitle"),
                description: t("cancelDescription", { pending: send.total - send.sent - send.failed - send.skipped }),
                confirmLabel: t("cancel"),
                destructive: true,
                onConfirm: async () => {
                  try {
                    await cancel.mutateAsync(send.id);
                    toast.success(t("cancelled"));
                  } catch (caught) {
                    toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
                  }
                },
              })
            }
          >
            <Prohibit size={14} />
            {t("cancel")}
          </Button>
        ) : null}
      </div>
      <AdminPanel className="p-4">
        <SendSummary send={send} />
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-ink-subtle">{t("audience")}</dt>
            <dd className="text-ink-muted">{audienceText(send, t)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-subtle">{t("created")}</dt>
            <dd className="text-ink-muted">{formatDate(send.createdAt)}</dd>
          </div>
          {Object.keys(send.values).length > 0 ? (
            <div className="flex gap-2 sm:col-span-2">
              <dt className="text-ink-subtle">{t("values")}</dt>
              <dd className="truncate text-ink-muted">
                {Object.entries(send.values)
                  .map(([name, value]) => `${name}: ${value}`)
                  .join(" · ")}
              </dd>
            </div>
          ) : null}
        </dl>
      </AdminPanel>
      <FilterChipGroup label={t("recipientFilter")}>
        {RECIPIENT_FILTERS.map((value) => (
          <FilterChip
            key={value || "all"}
            selected={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {value ? t(`recipientStatuses.${value}`) : t("allRecipients")}
          </FilterChip>
        ))}
      </FilterChipGroup>
      <AdminPanel>
        {recipients.isPending ? (
          <div className="h-32 animate-pulse" />
        ) : recipients.isError ? (
          <p className="px-4 py-6 text-[12.5px] text-destructive">{t("loadError")}</p>
        ) : recipients.data.items.length === 0 ? (
          <p className="px-4 py-6 text-[12.5px] text-ink-muted">{live ? t("resolving") : t("noRecipients")}</p>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-b border-border text-[11px] text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t("recipient")}</th>
                <th className="px-4 py-2 font-medium">{t("language")}</th>
                <th className="px-4 py-2 font-medium">{t("status")}</th>
                <th className="px-4 py-2 font-medium">{t("when")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {recipients.data.items.map((recipient) => (
                <tr key={recipient.userId}>
                  <td className="px-4 py-2">
                    <span className="block text-ink">{recipient.fullName ?? recipient.email}</span>
                    {recipient.fullName ? <span className="block text-[11.5px] text-ink-subtle">{recipient.email}</span> : null}
                  </td>
                  <td className="px-4 py-2 uppercase text-ink-muted">{recipient.locale}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "text-[12px]",
                        recipient.status === "SENT" && "text-emerald-700 dark:text-emerald-400",
                        recipient.status === "FAILED" && "text-destructive",
                        recipient.status === "SKIPPED" && "text-ink-subtle",
                      )}
                    >
                      {t(`recipientStatuses.${recipient.status}`)}
                    </span>
                    {recipient.error ? <span className="block text-[11px] text-ink-subtle">{recipient.error}</span> : null}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{recipient.sentAt ? formatDate(recipient.sentAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminPanel>
      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-[12px] text-ink-muted">
          {t("pageOf", { page, totalPages })}
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t("previous")}
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            {t("next")}
          </Button>
        </div>
      ) : null}
      {confirmDialog}
    </div>
  );
}

function audienceText(send: EmailCampaignDto, t: (key: string, values?: Record<string, string | number>) => string): string {
  const a = send.audience;
  const parts = [
    a.mode === "PLANS"
      ? t("audiencePlans", { plans: (a.planSlugs ?? []).join(", ") })
      : a.mode === "WORKSPACES"
        ? t("audienceWorkspaces", { count: (a.workspaceIds ?? []).length })
        : t("audienceAll"),
  ];
  if (a.roles?.length) parts.push(a.roles.join(", "));
  if (a.locales?.length) parts.push(a.locales.map((l) => l.toUpperCase()).join(", "));
  if (a.newUsersWithinDays) parts.push(t("audienceNew", { days: a.newUsersWithinDays }));
  return parts.join(" · ");
}
