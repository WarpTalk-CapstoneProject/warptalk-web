"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowsClockwise, Megaphone, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { AnnouncementComposer } from "@/components/admin/announcement-composer";
import { useAdminAnnouncements, useSendAdminAnnouncement } from "@/hooks/use-admin-announcements";
import {
  announcementDeliveredCount,
  announcementStatusClasses,
} from "@/lib/notifications/announcement-status";
import { cn } from "@/lib/utils";
import type { AdminAnnouncementSummaryDto } from "@/types/admin-announcement";

const PAGE_SIZE = 25;
const numberFormatter = new Intl.NumberFormat("en-US");

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function AnnouncementsList() {
  const t = useTranslations("adminAnnouncements.list");
  const router = useRouter();
  const searchParams = useSearchParams();

  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const query = useMemo(() => ({ page, pageSize: PAGE_SIZE }), [page]);
  const listQuery = useAdminAnnouncements(query);
  const sendAnnouncement = useSendAdminAnnouncement();
  const [isComposing, setIsComposing] = useState(false);

  const items = listQuery.data?.items ?? [];
  // totalCount, not total — this endpoint predates the shared admin envelope, and reading the
  // wrong field would render "0 of 0" over a full list.
  const total = listQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    const queryString = params.toString();
    router.replace(queryString ? `/admin/announcements?${queryString}` : "/admin/announcements");
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Megaphone size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button size="sm" onClick={() => setIsComposing(true)}>
              <PaperPlaneTilt size={14} weight="fill" />
              {t("compose")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              <ArrowsClockwise size={14} className={cn(listQuery.isFetching && "animate-spin")} />
              {t("refresh")}
            </Button>
          </>
        }
      />

      <AdminPanel className="mt-5">
        {listQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("error.title")}</p>
              <p className="mt-1 text-ink-muted">{t("error.description")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void listQuery.refetch()}
              >
                {t("error.retry")}
              </Button>
            </div>
          </div>
        ) : listQuery.isPending ? (
          <ul>
            {Array.from({ length: 5 }).map((_, index) => (
              <li key={index} className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
                <div className="h-3 w-60 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="grid place-items-center px-4 py-14 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
                <Megaphone size={20} weight="duotone" />
              </span>
              <p className="mt-3 text-sm font-medium">{t("empty.title")}</p>
              <p className="mt-1 text-xs text-ink-muted">{t("empty.description")}</p>
            </div>
          </div>
        ) : (
          <ul>
            {items.map((announcement) => (
              <li key={announcement.id}>
                <AnnouncementRow announcement={announcement} />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px] text-ink-muted">
          <span>{t("pagination.pageOf", { page, totalPages, total: numberFormatter.format(total) })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              {t("pagination.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              {t("pagination.next")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Compose goes through a review step rather than straight from the form. The send is
          irreversible — the service publishes delivery events onto a stream a live consumer is
          reading — so the confirmation naming the recipients is the design, not decoration. */}
      <p className="mt-4 text-[12px] text-ink-muted">{t("footerNote")}</p>

      <AnnouncementComposer
        open={isComposing}
        onOpenChange={setIsComposing}
        onSend={(request) => sendAnnouncement.mutateAsync(request)}
        isSending={sendAnnouncement.isPending}
      />
    </AdminPage>
  );
}

function AnnouncementRow({ announcement }: { announcement: AdminAnnouncementSummaryDto }) {
  const t = useTranslations("adminAnnouncements.list.delivery");
  const delivered = announcementDeliveredCount(announcement);

  return (
    <Link
      href={`/admin/announcements/${announcement.id}`}
      className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2 md:flex-row md:items-center md:gap-0"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{announcement.title}</p>
        <p className="truncate text-[11px] text-ink-subtle">{announcement.type}</p>
      </div>

      {/* WT-699 TC4101: coloured by what the status SAYS. Every non-draft row used to be green,
          so a Failed announcement read as delivered. */}
      <div className="w-[110px] shrink-0">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            announcementStatusClasses(announcement.status),
          )}
        >
          {announcement.status}
        </span>
      </div>

      {/* How the audience was chosen, which is the fact that decides how far this went. */}
      <div className="w-[160px] shrink-0 text-[12px] text-ink-muted">
        {announcement.targetAudienceMode}
      </div>

      {/* How far it actually went, now that the service records it (backend#406). */}
      <div className="w-[150px] shrink-0 text-[12px] text-ink-muted">
        {delivered !== null ? t("delivered", { count: delivered }) : "—"}
      </div>

      <div className="w-[190px] shrink-0 text-[12px] text-ink-muted md:text-right">
        {announcement.sentAt ? (
          t("sentAt", { date: formatWhen(announcement.sentAt) })
        ) : (
          <span title={t("createdTitle")}>{formatWhen(announcement.createdAt)}</span>
        )}
      </div>
    </Link>
  );
}

export default function AdminAnnouncementsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <AnnouncementsList />
    </Suspense>
  );
}
