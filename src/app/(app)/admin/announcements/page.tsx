"use client";

/**
 * Announcements — a CMS for what the app tells its users.
 *
 * Two views:
 *   Announcements     every CMS announcement, as cards or a table, filtered by what its status
 *                     means now (draft, scheduled, published, ended, archived), its type and its
 *                     placement. A published one is shown to its audience in its placement (top
 *                     banner, modal, toast, notification centre, dashboard card) while its window
 *                     is open.
 *   Inbox broadcasts  the one-shot notification sends, unchanged — a broadcast is delivered into
 *                     inboxes once, which is a different thing from an announcement that runs.
 *
 * Everything is read from the notification service; nothing is a hardcoded list.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArrowCounterClockwise,
  CaretDown,
  CaretUp,
  Copy,
  DotsThree,
  Eye,
  Megaphone,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { BroadcastHistory } from "@/components/admin/announcement-broadcast-history";
import { AnnouncementComposer } from "@/components/admin/announcement-composer";
import {
  AnnouncementSwatch,
  AnnouncementTypePill,
  AudienceLine,
  PlacementLabel,
  WindowLine,
} from "@/components/admin/cms/announcement-bits";
import { useConfirm } from "@/components/admin/cms/cms-editor";
import {
  CmsBulkBar,
  CmsEmptyState,
  CmsSearchInput,
  CmsSelectAll,
  CmsSelectBox,
  CmsSortSelect,
  CmsTable,
  CmsTd,
  CmsTh,
  CmsToolbar,
  CmsViewToggle,
  useListView,
} from "@/components/admin/cms/cms-list";
import { CmsCard, CmsCardGrid, CmsChip, EditedBy } from "@/components/admin/cms/cms-shared";
import { PreviewMarkdown } from "@/components/markdown/document-markdown";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import {
  useAdminAnnouncementCmsList,
  useAnnouncementBulk,
  useArchiveAnnouncement,
  useDeleteAnnouncement,
  useDuplicateAnnouncement,
  usePublishAnnouncement,
  useUnpublishAnnouncement,
} from "@/hooks/use-admin-announcement-cms";
import { useSendAdminAnnouncement } from "@/hooks/use-admin-announcements";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { prune, toggleAll, toggleOne } from "@/lib/admin/cms-selection";
import {
  availableActions,
  bulkActionsFor,
  CMS_TYPES,
  colorTokens,
  EFFECTIVE_STATUSES,
  PLACEMENTS,
  statusClasses,
  type CmsType,
  type EffectiveStatus,
  type Placement,
} from "@/lib/announcements/announcement-cms";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminAnnouncementCmsDto, AnnouncementBulkAction, AnnouncementSort } from "@/types/admin-cms";

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
  const tCommon = useTranslations("adminCms.common");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [type, setType] = useState<CmsType | "">("");
  const [placement, setPlacement] = useState<Placement | "">("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<AnnouncementSort>("updated");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [view, setView] = useListView("wt.admin.announcements.view");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, confirmDialog] = useConfirm();
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const bulk = useAnnouncementBulk();

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: status === "ALL" ? undefined : status,
      search: debouncedSearch || undefined,
      type: type || undefined,
      placement: placement || undefined,
      sort,
      order,
    }),
    [page, status, debouncedSearch, type, placement, sort, order],
  );
  const listQuery = useAdminAnnouncementCmsList(query);
  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  const counts = listQuery.data?.counts ?? {};
  const allCount = EFFECTIVE_STATUSES.reduce((sum, value) => sum + (counts[value] ?? 0), 0);
  const totalPages = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / PAGE_SIZE));
  const visibleIds = items.map((item) => item.id);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a page or filter change drops rows it hid
    setSelected((current) => prune(current, visibleIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds.join("|")]);

  const filtered = status !== "ALL" || Boolean(debouncedSearch) || Boolean(type) || Boolean(placement);
  const selectedStatuses = items.filter((item) => selected.includes(item.id)).map((item) => item.effectiveStatus);
  const bulkActions = bulkActionsFor(selectedStatuses);
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const runBulk = (action: AnnouncementBulkAction) =>
    confirm({
      title: t(`bulk.${action}.title`, { count: selected.length }),
      description: t(`bulk.${action}.description`),
      confirmLabel: t(`bulk.${action}.confirm`),
      destructive: action === "delete" || action === "archive",
      onConfirm: async () => {
        try {
          const result = await bulk.mutateAsync({ action, ids: selected });
          if (result.failed === 0) toast.success(t(`bulk.${action}.done`, { count: result.succeeded }));
          else toast.error(tCommon("bulk.partial", { failed: result.failed, error: result.items.find((item) => !item.succeeded)?.error ?? "" }));
          setSelected([]);
        } catch (caught) {
          toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
        }
      },
    });

  return (
    <>
      <CmsToolbar
        chips={
          <FilterChipGroup label={t("statusAria")}>
            {STATUS_FILTERS.map((value) => (
              <FilterChip
                key={value}
                selected={status === value}
                onClick={() => resetPage(setStatus)(value)}
                badge={listQuery.data ? (value === "ALL" ? allCount : (counts[value] ?? 0)) : undefined}
              >
                {t(`statuses.${value}`)}
              </FilterChip>
            ))}
          </FilterChipGroup>
        }
        controls={
          <>
            <CmsSearchInput value={search} onChange={resetPage(setSearch)} placeholder={t("searchPlaceholder")} />
            <select
              aria-label={t("filters.type")}
              value={type}
              onChange={(event) => resetPage(setType)(event.target.value as CmsType | "")}
              className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink"
            >
              <option value="">{t("filters.anyType")}</option>
              {CMS_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`editor.types.${value}.label`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("filters.placement")}
              value={placement}
              onChange={(event) => resetPage(setPlacement)(event.target.value as Placement | "")}
              className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink"
            >
              <option value="">{t("filters.anyPlacement")}</option>
              {PLACEMENTS.map((value) => (
                <option key={value} value={value}>
                  {t(`preview.placements.${value}`)}
                </option>
              ))}
            </select>
            <CmsSortSelect<AnnouncementSort>
              value={sort}
              onChange={resetPage(setSort)}
              options={(["updated", "created", "starts", "priority", "title"] as const).map((value) => ({ value, label: t(`sort.${value}`) }))}
            />
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={order === "desc" ? t("sort.descending") : t("sort.ascending")}
              title={order === "desc" ? t("sort.descending") : t("sort.ascending")}
              onClick={() => resetPage(setOrder)(order === "desc" ? "asc" : "desc")}
            >
              {order === "desc" ? <CaretDown size={14} /> : <CaretUp size={14} />}
            </Button>
            <CmsViewToggle view={view} onChange={setView} />
          </>
        }
      />

      <div className="mt-4">
        {listQuery.isError ? (
          <AdminPanel className="flex items-center gap-3 px-4 py-8 text-sm">
            <WarningCircle size={18} weight="duotone" className="shrink-0 text-destructive" />
            <span className="flex-1">{t("loadError")}</span>
            <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()}>
              {tCommon("retry")}
            </Button>
          </AdminPanel>
        ) : listQuery.isPending ? (
          <CmsCardGrid>
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index} className="h-[240px] animate-pulse rounded-lg bg-surface-2" />
            ))}
          </CmsCardGrid>
        ) : items.length === 0 ? (
          <CmsEmptyState
            icon={<Megaphone size={18} />}
            title={filtered ? t("empty.filtered") : t("empty.none")}
            description={filtered ? t("empty.filteredHint") : t("empty.noneHint")}
            action={
              filtered ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatus("ALL");
                    setSearch("");
                    setType("");
                    setPlacement("");
                    setPage(1);
                  }}
                >
                  {tCommon("list.clearFilters")}
                </Button>
              ) : (
                <Link href="/admin/announcements/posts/new" className={buttonVariants({ size: "sm" })}>
                  <Plus size={14} />
                  {t("new")}
                </Link>
              )
            }
          />
        ) : view === "cards" ? (
          <>
            <div className="mb-2 flex items-center gap-2 text-[12px] text-ink-muted">
              <CmsSelectAll selected={selected} visible={visibleIds} onToggle={() => setSelected(toggleAll(selected, visibleIds))} />
              {tCommon("list.selectAll")}
            </div>
            <CmsCardGrid>
              {items.map((announcement) => (
                <AnnouncementCard
                  key={announcement.id}
                  announcement={announcement}
                  selected={selected.includes(announcement.id)}
                  onSelect={() => setSelected(toggleOne(selected, announcement.id))}
                  confirm={confirm}
                />
              ))}
            </CmsCardGrid>
          </>
        ) : (
          <CmsTable
            head={
              <>
                <CmsTh className="w-10">
                  <CmsSelectAll selected={selected} visible={visibleIds} onToggle={() => setSelected(toggleAll(selected, visibleIds))} />
                </CmsTh>
                <CmsTh>{t("table.title")}</CmsTh>
                <CmsTh>{t("table.status")}</CmsTh>
                <CmsTh>{t("table.placement")}</CmsTh>
                <CmsTh>{t("table.audience")}</CmsTh>
                <CmsTh>{t("table.window")}</CmsTh>
                <CmsTh className="text-right">{t("table.priority")}</CmsTh>
                <CmsTh className="w-10" />
              </>
            }
          >
            {items.map((announcement) => (
              <AnnouncementRow
                key={announcement.id}
                announcement={announcement}
                selected={selected.includes(announcement.id)}
                onSelect={() => setSelected(toggleOne(selected, announcement.id))}
                confirm={confirm}
              />
            ))}
          </CmsTable>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-3 text-[12px] text-ink-muted">
          <span>{t("pageOf", { page, totalPages })}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t("previous")}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              {t("next")}
            </Button>
          </div>
        </div>
      ) : null}

      <CmsBulkBar count={selected.length} onClear={() => setSelected([])}>
        {bulkActions.includes("publish") ? (
          <Button size="sm" disabled={bulk.isPending} onClick={() => runBulk("publish")}>
            <UploadSimple size={14} />
            {t("bulk.publish.action")}
          </Button>
        ) : null}
        {bulkActions.includes("duplicate") ? (
          <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={() => runBulk("duplicate")}>
            <Copy size={14} />
            {t("bulk.duplicate.action")}
          </Button>
        ) : null}
        {bulkActions.includes("archive") ? (
          <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={() => runBulk("archive")}>
            <Archive size={14} />
            {t("bulk.archive.action")}
          </Button>
        ) : null}
        {bulkActions.includes("delete") ? (
          <Button variant="destructive" size="sm" disabled={bulk.isPending} onClick={() => runBulk("delete")}>
            <Trash size={14} />
            {t("bulk.delete.action")}
          </Button>
        ) : null}
      </CmsBulkBar>
      {confirmDialog}
    </>
  );
}

type Confirm = ReturnType<typeof useConfirm>[0];

/** The per-item lifecycle menu, shared by the card and the table row. */
function useRowActions(announcement: AdminAnnouncementCmsDto, confirm: Confirm) {
  const t = useTranslations("adminCms.announcements");
  const tCommon = useTranslations("adminCms.common");
  const router = useRouter();
  const publish = usePublishAnnouncement();
  const unpublish = useUnpublishAnnouncement();
  const archive = useArchiveAnnouncement();
  const duplicate = useDuplicateAnnouncement();
  const remove = useDeleteAnnouncement();
  const actions = availableActions(announcement.effectiveStatus);
  const href = `/admin/announcements/posts/${announcement.id}`;

  const run = async (success: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast.success(success);
    } catch (caught) {
      toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
    }
  };

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("actions.more")} onClick={(event) => event.stopPropagation()} />}>
        <DotsThree size={16} weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {actions.includes("publishNow") ? (
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={() =>
              confirm({
                title: t("confirm.publishTitle", { title: announcement.title }),
                description: t("confirm.publishDescription"),
                confirmLabel: t("actions.publishNow"),
                onConfirm: () => run(t("toasts.published"), () => publish.mutateAsync({ id: announcement.id, request: {} })),
              })
            }
          >
            <PaperPlaneTilt size={14} />
            {t("actions.publishNow")}
          </DropdownMenuItem>
        ) : null}
        {actions.includes("unpublish") ? (
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={() =>
              confirm({
                title: t("confirm.unpublishTitle", { title: announcement.title }),
                description: t("confirm.unpublishDescription"),
                confirmLabel: t("actions.unpublish"),
                onConfirm: () => run(t("toasts.unpublished"), () => unpublish.mutateAsync(announcement.id)),
              })
            }
          >
            <ArrowCounterClockwise size={14} />
            {t("actions.unpublish")}
          </DropdownMenuItem>
        ) : null}
        {actions.includes("restore") ? (
          <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => void run(t("toasts.restored"), () => unpublish.mutateAsync(announcement.id))}>
            <ArrowCounterClockwise size={14} />
            {t("actions.restore")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="cursor-pointer gap-2"
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
            onClick={() =>
              confirm({
                title: t("confirm.archiveTitle", { title: announcement.title }),
                description: t("confirm.archiveDescription"),
                confirmLabel: t("actions.archive"),
                destructive: true,
                onConfirm: () => run(t("toasts.archived"), () => archive.mutateAsync(announcement.id)),
              })
            }
          >
            <Archive size={14} />
            {t("actions.archive")}
          </DropdownMenuItem>
        ) : null}
        {actions.includes("delete") ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-destructive"
              onClick={() =>
                confirm({
                  title: t("deleteDialog.title"),
                  description: t("deleteDialog.description", { title: announcement.title }),
                  confirmLabel: t("deleteDialog.confirm"),
                  destructive: true,
                  onConfirm: () => run(t("toasts.deleted"), () => remove.mutateAsync(announcement.id)),
                })
              }
            >
              <Trash size={14} />
              {t("actions.delete")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return { menu, href };
}

function AnnouncementCard({
  announcement,
  selected,
  onSelect,
  confirm,
}: {
  announcement: AdminAnnouncementCmsDto;
  selected: boolean;
  onSelect: () => void;
  confirm: Confirm;
}) {
  const t = useTranslations("adminCms.announcements");
  const { menu, href } = useRowActions(announcement, confirm);
  return (
    <CmsCard accentClassName={colorTokens(announcement.accentColor).bar} className={cn(selected && "border-primary/50 ring-1 ring-primary/30")}>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2.5">
          <CmsSelectBox checked={selected} onChange={onSelect} label={t("selectOne", { title: announcement.title })} className="mt-0.5" />
          <AnnouncementSwatch announcement={announcement} />
          <div className="min-w-0 flex-1">
            <Link href={href} className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink hover:underline">
              {announcement.title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <CmsChip className={statusClasses(announcement.effectiveStatus)}>{t(`statuses.${announcement.effectiveStatus as EffectiveStatus}`)}</CmsChip>
              <AnnouncementTypePill type={announcement.type} />
            </div>
          </div>
        </div>
        <div className="mt-3 line-clamp-3 text-[12.5px] text-ink-muted">
          <PreviewMarkdown>{announcement.bodyMarkdown}</PreviewMarkdown>
        </div>
        <dl className="mt-3 space-y-1 text-[11.5px] text-ink-muted">
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-ink-subtle">{t("card.placement")}</dt>
            <dd className="truncate">
              <PlacementLabel placement={announcement.placement} />
              {announcement.priority ? ` · ${t("card.priority", { priority: announcement.priority })}` : ""}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-ink-subtle">{t("card.audience")}</dt>
            <dd className="truncate">
              <AudienceLine announcement={announcement} />
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-ink-subtle">{t("card.window")}</dt>
            <dd className="truncate">
              <WindowLine announcement={announcement} />
            </dd>
          </div>
        </dl>
        <div className="mt-auto pt-3 text-[11.5px] text-ink-subtle">
          <EditedBy at={announcement.updatedAt} by={announcement.updatedBy ?? announcement.createdBy} />
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        <Link href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <PencilSimple size={14} />
          {t("actions.edit")}
        </Link>
        <Link href={`${href}#preview`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <Eye size={14} />
          {t("actions.preview")}
        </Link>
        <span className="ml-auto">{menu}</span>
      </div>
    </CmsCard>
  );
}

function AnnouncementRow({
  announcement,
  selected,
  onSelect,
  confirm,
}: {
  announcement: AdminAnnouncementCmsDto;
  selected: boolean;
  onSelect: () => void;
  confirm: Confirm;
}) {
  const t = useTranslations("adminCms.announcements");
  const router = useRouter();
  const { menu, href } = useRowActions(announcement, confirm);
  return (
    <tr className={cn("cursor-pointer hover:bg-surface-2/60", selected && "bg-primary/5")} onClick={() => router.push(href)}>
      <CmsTd>
        <CmsSelectBox checked={selected} onChange={onSelect} label={t("selectOne", { title: announcement.title })} />
      </CmsTd>
      <CmsTd>
        <div className="flex items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", colorTokens(announcement.accentColor).bar)} aria-hidden />
          <Link href={href} onClick={(event) => event.stopPropagation()} className="max-w-[320px] truncate font-medium text-ink hover:underline">
            {announcement.title}
          </Link>
        </div>
      </CmsTd>
      <CmsTd>
        <CmsChip className={statusClasses(announcement.effectiveStatus)}>{t(`statuses.${announcement.effectiveStatus as EffectiveStatus}`)}</CmsChip>
      </CmsTd>
      <CmsTd className="text-[12px] text-ink-muted">
        <PlacementLabel placement={announcement.placement} />
      </CmsTd>
      <CmsTd className="max-w-[240px] truncate text-[12px] text-ink-muted">
        <AudienceLine announcement={announcement} />
      </CmsTd>
      <CmsTd className="max-w-[220px] truncate text-[12px] text-ink-muted">
        <WindowLine announcement={announcement} />
      </CmsTd>
      <CmsTd className="text-right tabular-nums">{announcement.priority}</CmsTd>
      <CmsTd>
        <span onClick={(event) => event.stopPropagation()}>{menu}</span>
      </CmsTd>
    </tr>
  );
}

export default function AdminAnnouncementsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <AnnouncementsCms />
    </Suspense>
  );
}
