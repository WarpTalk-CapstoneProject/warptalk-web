"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowsClockwise, Megaphone, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { AnnouncementComposer } from "@/components/admin/announcement-composer";
import { useAdminAnnouncements, useSendAdminAnnouncement } from "@/hooks/use-admin-announcements";
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
        eyebrow="Operations"
        eyebrowIcon={<Megaphone size={14} weight="fill" />}
        title="Announcements"
        description="Platform-wide notices that have been sent to users."
        actions={
          <>
            <Button size="sm" onClick={() => setIsComposing(true)}>
              <PaperPlaneTilt size={14} weight="fill" />
              Compose
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              <ArrowsClockwise size={14} className={cn(listQuery.isFetching && "animate-spin")} />
              Refresh
            </Button>
          </>
        }
      />

      <AdminPanel className="mt-5">
        {listQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Announcements could not be loaded.</p>
              <p className="mt-1 text-ink-muted">
                Check the notification service and that your session still holds the platform admin
                role.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void listQuery.refetch()}
              >
                Try again
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
              <p className="mt-3 text-sm font-medium">Nothing has been announced yet</p>
              <p className="mt-1 text-xs text-ink-muted">
                Announcements sent from the platform appear here.
              </p>
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
          <span>
            Page {page} of {totalPages} · {numberFormatter.format(total)} total
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {/* Compose goes through a review step rather than straight from the form. The send is
          irreversible — the service publishes delivery events onto a stream a live consumer is
          reading — so the confirmation naming the recipients is the design, not decoration. */}
      <p className="mt-4 text-[12px] text-ink-muted">
        An announcement is delivered once to the people it names and cannot be edited, recalled or
        deleted afterwards. There is no &ldquo;everyone&rdquo; audience: the service accepts a
        named list until a segment resolver is configured.
      </p>

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
  const isDraft = announcement.status.toLowerCase() === "draft";

  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{announcement.title}</p>
        <p className="truncate text-[11px] text-ink-subtle">{announcement.type}</p>
      </div>

      <div className="w-[110px] shrink-0">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            isDraft
              ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {announcement.status}
        </span>
      </div>

      {/* How the audience was chosen, which is the fact that decides how far this went. */}
      <div className="w-[160px] shrink-0 text-[12px] text-ink-muted">
        {announcement.targetAudienceMode}
      </div>

      <div className="w-[190px] shrink-0 text-[12px] text-ink-muted md:text-right">
        {formatWhen(announcement.createdAt)}
      </div>
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-surface-1" />}>
      <AnnouncementsList />
    </Suspense>
  );
}
