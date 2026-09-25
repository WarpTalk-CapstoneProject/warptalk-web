"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  Bell,
  CheckCircle,
  ClockCountdown,
  CreditCard,
  EnvelopeSimple,
  Handshake,
  Lightning,
  Megaphone,
  Receipt,
  Tray,
  UserPlus,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAdminInboxActions, useAdminInboxNotes } from "@/hooks/use-admin-inbox";
import { useCan } from "@/hooks/use-staff-access";
import { SNOOZE_PRESETS, snoozeUntil } from "@/lib/admin/inbox";
import { ADMIN_PERMISSIONS } from "@/lib/admin/staff-permissions";
import { getErrorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import { adminStaffService } from "@/services/admin-staff.service";
import type { InboxItemDto } from "@/types/admin-inbox";

const TYPE_ICONS: Record<string, typeof Tray> = {
  sales_lead: Handshake,
  invoice_past_due: WarningOctagon,
  invoice_awaiting_payment: CreditCard,
  payment_disputed: Warning,
  trial_ending: ClockCountdown,
  subscription_ending: ClockCountdown,
  subscription_suspended: WarningOctagon,
  provider_incident: Lightning,
  provider_quota: Lightning,
  expense_due: Receipt,
  staff_invitation: UserPlus,
  announcement_scheduled: Megaphone,
  announcement_draft: Megaphone,
  broadcast_failed: EnvelopeSimple,
  dead_letter: Bell,
};

export function InboxTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = TYPE_ICONS[type] ?? Tray;
  return (
    <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted", className)}>
      <Icon size={15} weight="duotone" />
    </span>
  );
}

/** Localized labels for the values the server sends; an unknown value (a newer source) shows as sent. */
export function useInboxLabels() {
  const t = useTranslations("adminInbox");
  return useMemo(
    () => ({
      type: (value: string) => (t.has(`types.${value}`) ? t(`types.${value}`) : value),
      priority: (value: string) => (t.has(`priorities.${value}`) ? t(`priorities.${value}`) : value),
      source: (value: string) => (t.has(`sources.${value}`) ? t(`sources.${value}`) : value),
    }),
    [t],
  );
}

/**
 * One item, opened: what it is, where it is resolved (the deep link), and the triage — assign,
 * snooze, notes, and "mark done" only where the source never closes the item by itself.
 */
export function InboxItemSheet({
  item,
  canManage,
  viewerId,
  onClose,
}: {
  item: InboxItemDto | null;
  canManage: boolean;
  viewerId: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={item !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {item ? <ItemBody item={item} canManage={canManage} viewerId={viewerId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function ItemBody({ item, canManage, viewerId }: { item: InboxItemDto; canManage: boolean; viewerId: string | null }) {
  const t = useTranslations("adminInbox");
  const labels = useInboxLabels();
  const actions = useAdminInboxActions();
  const notes = useAdminInboxNotes(item.key);
  const canListStaff = useCan(ADMIN_PERMISSIONS.staffRead);
  const staff = useQuery({
    queryKey: ["admin-staff", "directory", { status: "active", pageSize: 100 }],
    queryFn: () => adminStaffService.list({ status: "active", pageSize: 100, sort: "name", dir: "asc" }),
    enabled: canManage && canListStaff,
    staleTime: 60_000,
  });
  const [note, setNote] = useState("");

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(getErrorMessage(error, t("actionFailed")));
    }
  };

  const assignTo = (assigneeId: string | null) =>
    run(() => actions.assign.mutateAsync({ key: item.key, assigneeId }), assigneeId ? t("toasts.assigned") : t("toasts.unassigned"));

  const addNote = async () => {
    const body = note.trim();
    if (!body) return;
    await run(() => actions.addNote.mutateAsync({ key: item.key, body }), t("toasts.noteAdded"));
    setNote("");
    void notes.refetch();
  };

  const busy =
    actions.assign.isPending || actions.snooze.isPending || actions.done.isPending || actions.reopen.isPending || actions.addNote.isPending;

  return (
    <>
      <SheetHeader className="border-b border-hairline pb-4">
        <div className="flex items-start gap-3">
          <InboxTypeIcon type={item.type} />
          <div className="min-w-0">
            <SheetTitle className="text-[15px]">{labels.type(item.type)}</SheetTitle>
            <SheetDescription className="text-[13px]">{item.title}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5 p-4">
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[13px]">
          {item.detail ? (
            <>
              <dt className="text-ink-muted">{t("detail.detail")}</dt>
              <dd className="text-ink">{item.detail}</dd>
            </>
          ) : null}
          {item.customer || item.workspaceId ? (
            <>
              <dt className="text-ink-muted">{t("columns.customer")}</dt>
              <dd className="text-ink">
                {item.workspaceId ? (
                  <Link href={`/admin/workspaces/${item.workspaceId}`} className="hover:underline">
                    {item.customer ?? t("unnamedWorkspace")}
                  </Link>
                ) : (
                  item.customer
                )}
              </dd>
            </>
          ) : null}
          {item.amount !== null && item.currency ? (
            <>
              <dt className="text-ink-muted">{t("detail.amount")}</dt>
              <dd className="tabular-nums text-ink">{formatMoney(item.amount, item.currency)}</dd>
            </>
          ) : null}
          <dt className="text-ink-muted">{t("columns.priority")}</dt>
          <dd className="text-ink">{labels.priority(item.priority)}</dd>
          <dt className="text-ink-muted">{t("detail.waitingSince")}</dt>
          <dd className="text-ink">{new Date(item.occurredAt).toLocaleString()}</dd>
          <dt className="text-ink-muted">{t("columns.due")}</dt>
          <dd className={cn(item.overdue ? "font-medium text-destructive" : "text-ink")}>
            {item.dueAt ? new Date(item.dueAt).toLocaleString() : "—"}
            {item.overdue ? ` · ${t("sla.overdue")}` : ""}
          </dd>
          <dt className="text-ink-muted">{t("filters.source")}</dt>
          <dd className="text-ink">{labels.source(item.source)}</dd>
        </dl>

        <p className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">
          {item.naturalCompletion ? t("detail.closesItself") : t("detail.closesByHand")}
        </p>

        <Link href={item.href} className={cn(buttonVariants(), "w-full")}>
          <ArrowSquareOut size={14} />
          {t("open")}
        </Link>

        {canManage ? (
          <section className="space-y-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">{t("triage.title")}</h3>

            <div className="space-y-1.5">
              <p className="text-[12px] text-ink-muted">
                {t("triage.assignedTo")}{" "}
                <span className="text-ink">
                  {item.triage.assigneeId
                    ? item.triage.assigneeId === viewerId
                      ? t("assignee.me")
                      : (item.triage.assigneeName ?? t("assignee.someone"))
                    : t("assignee.unassigned")}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {viewerId && item.triage.assigneeId !== viewerId ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void assignTo(viewerId)}>
                    {t("triage.assignToMe")}
                  </Button>
                ) : null}
                {canListStaff && staff.data ? (
                  <select
                    aria-label={t("triage.assignTo")}
                    disabled={busy}
                    value=""
                    onChange={(event) => event.target.value && void assignTo(event.target.value)}
                    className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[12px] text-ink"
                  >
                    <option value="">{t("triage.assignTo")}</option>
                    {staff.data.items
                      .filter((member) => member.userId !== item.triage.assigneeId)
                      .map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.fullName || member.email}
                        </option>
                      ))}
                  </select>
                ) : null}
                {item.triage.assigneeId ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void assignTo(null)}>
                    {t("triage.unassign")}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[12px] text-ink-muted">
                {item.snoozed && item.triage.snoozedUntil
                  ? t("triage.snoozedUntil", { when: new Date(item.triage.snoozedUntil).toLocaleString() })
                  : t("triage.snooze")}
              </p>
              <div className="flex flex-wrap gap-2">
                {SNOOZE_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => actions.snooze.mutateAsync({ key: item.key, until: snoozeUntil(preset).toISOString() }),
                        t("toasts.snoozed"),
                      )
                    }
                  >
                    {t(`snooze.${preset}`)}
                  </Button>
                ))}
                {item.snoozed ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => actions.snooze.mutateAsync({ key: item.key, until: null }), t("toasts.woken"))}
                  >
                    {t("triage.wake")}
                  </Button>
                ) : null}
              </div>
            </div>

            {!item.naturalCompletion ? (
              item.done ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => actions.reopen.mutateAsync(item.key), t("toasts.reopened"))}>
                  {t("triage.reopen")}
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => void run(() => actions.done.mutateAsync(item.key), t("toasts.done"))}>
                  <CheckCircle size={14} />
                  {t("triage.markDone")}
                </Button>
              )
            ) : null}
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">{t("notes.title")}</h3>
          {notes.isPending ? (
            <p className="text-[12px] text-ink-subtle">{t("notes.loading")}</p>
          ) : (notes.data ?? []).length === 0 ? (
            <p className="text-[12px] text-ink-subtle">{t("notes.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {(notes.data ?? []).map((entry) => (
                <li key={entry.id} className="rounded-lg border border-hairline px-3 py-2">
                  <p className="whitespace-pre-line text-[13px] text-ink">{entry.body}</p>
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    {entry.authorName ?? t("assignee.someone")} · {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {canManage ? (
            <div className="space-y-2">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("notes.placeholder")}
                maxLength={4000}
                rows={3}
              />
              <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => void addNote()}>
                {t("notes.add")}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
