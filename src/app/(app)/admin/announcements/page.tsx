"use client";

/**
 * Announcements — a CMS for what the app tells its users.
 *
 * Two views:
 *   Announcements     cards for every CMS announcement, filtered by what its status means now
 *                     (draft, scheduled, published, ended, archived). Published ones are shown in
 *                     the app's announcement strip to their audience while the window is open.
 *   Inbox broadcasts  the one-shot notification sends, unchanged — a broadcast is delivered into
 *                     inboxes once, which is a different thing from a banner that runs for a while.
 *
 * Everything on the cards is read from the notification service; nothing is a hardcoded list.
 */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArrowCounterClockwise,
  ArrowsClockwise,
  CalendarBlank,
  Copy,
  DotsThree,
  Eye,
  MagnifyingGlass,
  Megaphone,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader } from "@/components/admin/admin-page-chrome";
import { BroadcastHistory } from "@/components/admin/announcement-broadcast-history";
import { AnnouncementComposer } from "@/components/admin/announcement-composer";
import { AudienceLine, WindowLine } from "@/components/admin/cms/announcement-bits";
import { CmsCard, CmsCardGrid, CmsChip, EditedBy } from "@/components/admin/cms/cms-shared";
import { AnnouncementPreviewDialog } from "@/components/admin/cms/announcement-preview-dialog";
import { AnnouncementTypePill } from "@/components/announcements/announcement-card-view";
import { PreviewMarkdown } from "@/components/markdown/document-markdown";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import {
  useAdminAnnouncementCmsList,
  useArchiveAnnouncement,
  useDeleteAnnouncement,
  useDuplicateAnnouncement,
  usePublishAnnouncement,
  useUnpublishAnnouncement,
} from "@/hooks/use-admin-announcement-cms";
import { useSendAdminAnnouncement } from "@/hooks/use-admin-announcements";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  availableActions,
  EFFECTIVE_STATUSES,
  statusClasses,
  typeAccent,
  type EffectiveStatus,
} from "@/lib/announcements/announcement-cms";
import { getErrorMessage } from "@/lib/api/errors";
import type { AdminAnnouncementCmsDto } from "@/types/admin-cms";

const PAGE_SIZE = 24;
type StatusFilter = "ALL" | EffectiveStatus;
const STATUS_FILTERS: StatusFilter[] = ["ALL", ...EFFECTIVE_STATUSES];

function AnnouncementsCms() {
  const t = useTranslations("adminCms.announcements");
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "broadcasts" ? "broadcasts" : "cms";

  const [composing, setComposing] = useState(false);
  const sendBroadcast = useSendAdminAnnouncement();

  const setView = (next: "cms" | "broadcasts") => {
    router.replace(next === "broadcasts" ? "/admin/announcements?view=broadcasts" : "/admin/announcements");
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
            <Button variant="outline" size="sm" onClick={() => setComposing(true)}>
              <PaperPlaneTilt size={14} />
              {t("inboxBroadcast")}
            </Button>
            <Link href="/admin/announcements/posts/new" className={buttonVariants({ size: "sm" })}>
              <Plus size={14} />
              {t("new")}
            </Link>
          </>
        }
      />

      <FilterChipGroup label={t("viewAria")} className="border-b border-border py-3">
        <FilterChip selected={view === "cms"} onClick={() => setView("cms")}>
          {t("views.cms")}
        </FilterChip>
        <FilterChip selected={view === "broadcasts"} onClick={() => setView("broadcasts")}>
          {t("views.broadcasts")}
        </FilterChip>
      </FilterChipGroup>

      {view === "broadcasts" ? <BroadcastHistory /> : <CmsView />}

      <AnnouncementComposer
        open={composing}
        onOpenChange={setComposing}
        onSend={(request) => sendBroadcast.mutateAsync(request)}
        isSending={sendBroadcast.isPending}
      />
    </AdminPage>
  );
}

function CmsView() {
  const t = useTranslations("adminCms.announcements");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [previewing, setPreviewing] = useState<AdminAnnouncementCmsDto | null>(null);
  const [deleting, setDeleting] = useState<AdminAnnouncementCmsDto | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: status === "ALL" ? undefined : status,
      search: debouncedSearch || undefined,
    }),
    [page, status, debouncedSearch],
  );
  const listQuery = useAdminAnnouncementCmsList(query);
  const items = listQuery.data?.items ?? [];
  const counts = listQuery.data?.counts ?? {};
  const allCount = EFFECTIVE_STATUSES.reduce((sum, value) => sum + (counts[value] ?? 0), 0);
  const totalPages = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE));

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-border py-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChipGroup label={t("statusAria")}>
          {STATUS_FILTERS.map((value) => (
            <FilterChip
              key={value}
              selected={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              badge={listQuery.data ? (value === "ALL" ? allCount : (counts[value] ?? 0)) : undefined}
            >
              {t(`statuses.${value}`)}
            </FilterChip>
          ))}
        </FilterChipGroup>
        <div className="flex items-center gap-2">
          <div className="relative w-full lg:w-64">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <Input
              className="pl-8"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("refresh")}
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <ArrowsClockwise size={14} className={listQuery.isFetching ? "animate-spin" : undefined} />
          </Button>
        </div>
      </div>

      <div className="mt-5">
        {listQuery.isError ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-1 px-4 py-8 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("error.title")}</p>
              <p className="mt-1 text-ink-muted">{t("error.description")}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void listQuery.refetch()}>
                {t("error.retry")}
              </Button>
            </div>
          </div>
        ) : listQuery.isPending ? (
          <CmsCardGrid>
            {Array.from({ length: 6 }).map((_, index) => (
              <CmsCard key={index}>
                <div className="space-y-3 p-4">
                  <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
                  <div className="h-4 w-56 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
                </div>
              </CmsCard>
            ))}
          </CmsCardGrid>
        ) : items.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-border bg-surface-1 px-4 py-14 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
                <Megaphone size={20} weight="duotone" />
              </span>
              <p className="mt-3 text-sm font-medium">
                {status === "ALL" && !debouncedSearch ? t("empty.title") : t("empty.filteredTitle")}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{t("empty.description")}</p>
              <Link href="/admin/announcements/posts/new" className={buttonVariants({ size: "sm", className: "mt-4" })}>
                <Plus size={14} />
                {t("new")}
              </Link>
            </div>
          </div>
        ) : (
          <CmsCardGrid>
            {items.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                onPreview={() => setPreviewing(announcement)}
                onDelete={() => setDeleting(announcement)}
              />
            ))}
          </CmsCardGrid>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px] text-ink-muted">
          <span>{t("pageOf", { page, totalPages })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t("previous")}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              {t("next")}
            </Button>
          </div>
        </div>
      ) : null}

      <AnnouncementPreviewDialog announcement={previewing} onClose={() => setPreviewing(null)} />
      <DeleteDialog announcement={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function AnnouncementCard({
  announcement,
  onPreview,
  onDelete,
}: {
  announcement: AdminAnnouncementCmsDto;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("adminCms.announcements");
  const href = `/admin/announcements/posts/${announcement.id}`;
  const actions = availableActions(announcement.effectiveStatus);
  const router = useRouter();

  const publish = usePublishAnnouncement();
  const unpublish = useUnpublishAnnouncement();
  const archive = useArchiveAnnouncement();
  const duplicate = useDuplicateAnnouncement();
  const busy = publish.isPending || unpublish.isPending || archive.isPending || duplicate.isPending;

  const run = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast.success(label);
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.failed")));
    }
  };

  return (
    <CmsCard accentClassName={typeAccent(announcement.type)}>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <CmsChip className={statusClasses(announcement.effectiveStatus)}>
            {t(`statuses.${announcement.effectiveStatus as EffectiveStatus}`)}
          </CmsChip>
          <AnnouncementTypePill type={announcement.type} />
        </div>
        <Link href={href} className="mt-3 block">
          <h2 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink group-hover:underline group-hover:underline-offset-2">
            {announcement.title}
          </h2>
        </Link>
        <PreviewMarkdown className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-ink-muted">
          {announcement.bodyMarkdown}
        </PreviewMarkdown>

        <dl className="mt-auto space-y-1 pt-4 text-[12px]">
          <div className="flex items-center gap-2 text-ink-muted">
            <dt className="sr-only">{t("card.audience")}</dt>
            <Megaphone size={12} className="shrink-0 text-ink-subtle" />
            <dd className="truncate">
              <AudienceLine announcement={announcement} />
            </dd>
          </div>
          <div className="flex items-center gap-2 text-ink-muted">
            <dt className="sr-only">{t("card.window")}</dt>
            <CalendarBlank size={12} className="shrink-0 text-ink-subtle" />
            <dd className="truncate">
              <WindowLine announcement={announcement} />
            </dd>
          </div>
          {announcement.ctaLabel ? (
            <div className="flex items-center gap-2 text-ink-muted">
              <dt className="sr-only">{t("card.cta")}</dt>
              <span className="shrink-0 text-ink-subtle">↗</span>
              <dd className="truncate">
                {announcement.ctaLabel} · <span className="font-mono text-[11px]">{announcement.ctaUrl}</span>
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-2 truncate text-[11.5px] text-ink-subtle">
          <EditedBy at={announcement.updatedAt} by={announcement.updatedBy ?? announcement.createdBy} />
        </p>
      </div>

      <div className="flex items-center gap-1 border-t border-border px-3 py-2">
        <Link href={href} className={buttonVariants({ size: "sm" })}>
          <PencilSimple size={13} />
          {t("actions.edit")}
        </Link>
        <Button variant="ghost" size="sm" onClick={onPreview}>
          <Eye size={13} />
          {t("actions.preview")}
        </Button>
        {actions.includes("publishNow") ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(t("toasts.published"), () => publish.mutateAsync({ id: announcement.id, request: {} }))
            }
          >
            <PaperPlaneTilt size={13} />
            {t("actions.publishNow")}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={t("actions.more")} />}
          >
            <DotsThree size={16} weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {actions.includes("schedule") ? (
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => router.push(`${href}#schedule`)}>
                <CalendarBlank size={14} />
                {t("actions.schedule")}
              </DropdownMenuItem>
            ) : null}
            {actions.includes("unpublish") ? (
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                disabled={busy}
                onClick={() => void run(t("toasts.unpublished"), () => unpublish.mutateAsync(announcement.id))}
              >
                <ArrowCounterClockwise size={14} />
                {t("actions.unpublish")}
              </DropdownMenuItem>
            ) : null}
            {actions.includes("restore") ? (
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                disabled={busy}
                onClick={() => void run(t("toasts.restored"), () => unpublish.mutateAsync(announcement.id))}
              >
                <ArrowCounterClockwise size={14} />
                {t("actions.restore")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="cursor-pointer gap-2"
              disabled={busy}
              onClick={() =>
                void run(t("toasts.duplicated"), async () => {
                  const copy = await duplicate.mutateAsync(announcement.id);
                  router.push(`/admin/announcements/posts/${copy.id}`);
                })
              }
            >
              <Copy size={14} />
              {t("actions.duplicate")}
            </DropdownMenuItem>
            {actions.includes("archive") ? (
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                disabled={busy}
                onClick={() => void run(t("toasts.archived"), () => archive.mutateAsync(announcement.id))}
              >
                <Archive size={14} />
                {t("actions.archive")}
              </DropdownMenuItem>
            ) : null}
            {actions.includes("delete") ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2 text-destructive" onClick={onDelete}>
                  <Trash size={14} />
                  {t("actions.delete")}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CmsCard>
  );
}

function DeleteDialog({
  announcement,
  onClose,
}: {
  announcement: AdminAnnouncementCmsDto | null;
  onClose: () => void;
}) {
  const t = useTranslations("adminCms.announcements");
  const remove = useDeleteAnnouncement();

  const confirm = async () => {
    if (!announcement) return;
    try {
      await remove.mutateAsync(announcement.id);
      toast.success(t("toasts.deleted"));
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.failed")));
    }
  };

  return (
    <Dialog open={Boolean(announcement)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
          <DialogDescription>{t("deleteDialog.description", { title: announcement?.title ?? "" })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("deleteDialog.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={remove.isPending}>
            {t("deleteDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminAnnouncementsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <AnnouncementsCms />
    </Suspense>
  );
}
