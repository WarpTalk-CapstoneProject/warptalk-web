"use client";

/**
 * One announcement's editor.
 *
 * `/admin/announcements/posts/new` starts a draft; saving it creates the row and moves the URL to
 * its id. Publish now and Schedule save first when there are unsaved changes, so what goes live is
 * always what is on screen. The lifecycle buttons are exactly the transitions the server allows
 * for the current status (availableActions), never one the server would refuse.
 *
 * Tabs: Content (title, rich body with images, buttons) · Design (placement, variant, colour,
 * icon, image) · Audience (plans or workspaces, roles, locales, new users) · Schedule (window,
 * priority, dismissible, frequency) · Preview (every placement, desktop/phone, light/dark) ·
 * History (the audit log) · Analytics (impressions, dismissals, clicks).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  CalendarBlank,
  CircleNotch,
  Copy,
  DeviceMobile,
  Desktop,
  Eye,
  FloppyDisk,
  ImageSquare,
  MagnifyingGlass,
  Megaphone,
  Moon,
  PaperPlaneTilt,
  Sun,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { ChartEmpty, ChartFigure, CHART_COLORS, TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import { AnnouncementTypePill, AudienceLine, WindowLine } from "@/components/admin/cms/announcement-bits";
import { AnnouncementPlacementPreview, type PreviewDevice } from "@/components/admin/cms/announcement-preview";
import {
  CmsActionBar,
  CmsTabBar,
  CmsTabPanel,
  DirtyDot,
  useConfirm,
  useHashTab,
  useSaveShortcut,
  useUnsavedGuard,
} from "@/components/admin/cms/cms-editor";
import { AuditHistory } from "@/components/admin/cms/cms-history";
import { CmsChip, EditedBy } from "@/components/admin/cms/cms-shared";
import { MarkdownEditor } from "@/components/admin/cms/markdown-editor";
import { AnnouncementIcon, resolveImage, type AnnouncementViewModel } from "@/components/announcements/announcement-surfaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useAdminAnnouncementCms,
  useAnnouncementAnalytics,
  useArchiveAnnouncement,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useDuplicateAnnouncement,
  usePublishAnnouncement,
  useUnpublishAnnouncement,
  useUpdateAnnouncement,
  useUploadAnnouncementAsset,
} from "@/hooks/use-admin-announcement-cms";
import { useAdminPlans } from "@/hooks/use-admin-pricing";
import { useAdminWorkspaceByRef, useAdminWorkspaceDirectory } from "@/hooks/use-admin-workspaces";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  AUDIENCE_MODES,
  availableActions,
  CMS_TYPES,
  COLORS,
  colorTokens,
  draftFrom,
  emptyDraft,
  FREQUENCIES,
  ICONS,
  iconFor,
  LIMITS,
  LOCALES,
  PLACEMENTS,
  ROLES,
  sameDraft,
  statusClasses,
  toRequest,
  toUtcIso,
  validateDraft,
  VARIANTS,
  type AnnouncementDraft,
  type CmsAction,
  type EffectiveStatus,
  type Placement,
} from "@/lib/announcements/announcement-cms";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminAnnouncementCmsDto } from "@/types/admin-cms";

const TABS = ["content", "design", "audience", "schedule", "preview", "history", "analytics"] as const;
type Tab = (typeof TABS)[number];

export default function AnnouncementEditorPage() {
  const params = useParams<{ postId: string }>();
  const isNew = params.postId === "new";
  const t = useTranslations("adminCms.announcements.editor");
  const detail = useAdminAnnouncementCms(isNew ? undefined : params.postId);

  const backLink = (
    <Link href="/admin/announcements" className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink">
      <ArrowLeft size={12} />
      {t("back")}
    </Link>
  );

  if (!isNew && detail.isError) {
    const notFound = apiErrorCode(detail.error) === 404;
    return (
      <AdminPage>
        {backLink}
        <AdminPanel className="flex items-start gap-3 px-4 py-10 text-sm">
          <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">{notFound ? t("notFound") : t("loadError")}</p>
            {!notFound ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void detail.refetch()}>
                {t("retry")}
              </Button>
            ) : null}
          </div>
        </AdminPanel>
      </AdminPage>
    );
  }

  if (!isNew && !detail.data) {
    return (
      <AdminPage>
        {backLink}
        <div className="h-8 w-72 animate-pulse rounded bg-surface-2" />
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <div className="h-[560px] animate-pulse rounded-lg bg-surface-2" />
          <div className="h-[360px] animate-pulse rounded-lg bg-surface-2" />
        </div>
      </AdminPage>
    );
  }

  return (
    <Editor
      // Re-seeded whenever the server copy changes (a save, a publish), so the form never edits a
      // version that no longer exists.
      key={detail.data ? `${detail.data.id}:${detail.data.updatedAt}` : "new"}
      announcement={detail.data ?? null}
      backLink={backLink}
    />
  );
}

function viewModel(draft: AnnouncementDraft, placeholderTitle: string, placeholderBody: string): AnnouncementViewModel {
  const request = toRequest(draft);
  return {
    title: request.title || placeholderTitle,
    bodyMarkdown: request.bodyMarkdown || placeholderBody,
    type: request.type,
    variant: request.variant,
    accentColor: request.accentColor,
    icon: request.icon,
    imageUrl: request.imageUrl,
    dismissible: request.dismissible,
    ctaLabel: request.ctaLabel,
    ctaUrl: request.ctaUrl,
    secondaryCtaLabel: request.secondaryCtaLabel,
    secondaryCtaUrl: request.secondaryCtaUrl,
  };
}

function Editor({ announcement, backLink }: { announcement: AdminAnnouncementCmsDto | null; backLink: React.ReactNode }) {
  const t = useTranslations("adminCms.announcements");
  const tEditor = useTranslations("adminCms.announcements.editor");
  const tCommon = useTranslations("adminCms.common");
  const router = useRouter();
  const [tab, setTab] = useHashTab(TABS, "content");

  const initial = useMemo(() => (announcement ? draftFrom(announcement) : emptyDraft()), [announcement]);
  const [draft, setDraft] = useState<AnnouncementDraft>(initial);
  const [confirm, confirmDialog] = useConfirm();
  // "Is the start in the future?" needs a clock; ticking it keeps Schedule honest while the page
  // sits open past the chosen start.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const publish = usePublishAnnouncement();
  const unpublish = useUnpublishAnnouncement();
  const archive = useArchiveAnnouncement();
  const duplicate = useDuplicateAnnouncement();
  const remove = useDeleteAnnouncement();
  const busy = [create, update, publish, unpublish, archive, duplicate, remove].some((mutation) => mutation.isPending);

  const status = (announcement?.effectiveStatus ?? "DRAFT") as EffectiveStatus;
  const actions: CmsAction[] = announcement ? availableActions(status) : ["publishNow", "schedule"];
  const dirty = !announcement || !sameDraft(draft, initial);
  const unsaved = announcement ? dirty : !sameDraft(draft, emptyDraft());
  const error = validateDraft(draft);
  const archived = status === "ARCHIVED";
  const scheduledStart = toUtcIso(draft.startsAt);
  const canSchedule = Boolean(scheduledStart && Date.parse(scheduledStart) > now);
  const debouncedDraft = useDebouncedValue(draft, 150);
  const preview = viewModel(debouncedDraft, tEditor("previewPlaceholderTitle"), tEditor("previewPlaceholderBody"));

  useUnsavedGuard(unsaved);

  const set = <K extends keyof AnnouncementDraft>(field: K, value: AnnouncementDraft[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  /** Saves what is on screen and returns the id it lives under. */
  const persist = useCallback(async (): Promise<string> => {
    const request = toRequest(draft);
    if (!announcement) {
      const created = await create.mutateAsync(request);
      router.replace(`/admin/announcements/posts/${created.id}${window.location.hash}`);
      return created.id;
    }
    if (dirty) await update.mutateAsync({ id: announcement.id, request });
    return announcement.id;
  }, [draft, announcement, create, update, router, dirty]);

  const run = async (success: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast.success(success);
    } catch (caught) {
      toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
    }
  };

  const canSave = dirty && !error && !busy && !archived;
  const handleSave = () => {
    if (canSave) void run(t("toasts.saved"), persist);
  };
  useSaveShortcut(handleSave, canSave);

  const askPublishNow = () =>
    confirm({
      title: t("confirm.publishTitle", { title: draft.title || tEditor("newTitle") }),
      description: t("confirm.publishDescription"),
      confirmLabel: dirty && announcement ? tEditor("saveAndPublish") : t("actions.publishNow"),
      onConfirm: () =>
        run(t("toasts.published"), async () => {
          const id = await persist();
          await publish.mutateAsync({ id, request: {} });
        }),
    });

  const askSchedule = () =>
    confirm({
      title: tEditor("scheduleDialog.title"),
      description: tEditor("scheduleDialog.description", { date: new Date(scheduledStart ?? "").toLocaleString() }),
      confirmLabel: tEditor("schedule"),
      onConfirm: () =>
        run(t("toasts.scheduled"), async () => {
          const id = await persist();
          await publish.mutateAsync({ id, request: { startsAt: scheduledStart } });
        }),
    });

  const askUnpublish = () =>
    confirm({
      title: t("confirm.unpublishTitle", { title: announcement?.title ?? "" }),
      description: t("confirm.unpublishDescription"),
      confirmLabel: t("actions.unpublish"),
      onConfirm: () => run(t("toasts.unpublished"), () => unpublish.mutateAsync(announcement!.id)),
    });

  const askArchive = () =>
    confirm({
      title: t("confirm.archiveTitle", { title: announcement?.title ?? "" }),
      description: t("confirm.archiveDescription"),
      confirmLabel: t("actions.archive"),
      destructive: true,
      onConfirm: () => run(t("toasts.archived"), () => archive.mutateAsync(announcement!.id)),
    });

  const askDelete = () =>
    confirm({
      title: t("deleteDialog.title"),
      description: t("deleteDialog.description", { title: announcement?.title ?? "" }),
      confirmLabel: t("deleteDialog.confirm"),
      destructive: true,
      onConfirm: () =>
        run(t("toasts.deleted"), async () => {
          await remove.mutateAsync(announcement!.id);
          router.push("/admin/announcements");
        }),
    });

  const handleDuplicate = () =>
    void run(t("toasts.duplicated"), async () => {
      const copy = await duplicate.mutateAsync(announcement!.id);
      router.push(`/admin/announcements/posts/${copy.id}`);
    });

  const tabErrors: Partial<Record<Tab, boolean>> = error
    ? {
        content: ["titleRequired", "titleTooLong", "bodyRequired", "bodyTooLong", "labelWithoutLink", "linkWithoutLabel", "labelTooLong", "linkInvalid", "secondaryNeedsPrimary", "secondaryIncomplete", "secondaryLinkInvalid"].includes(error),
        design: error === "imageInvalid",
        audience: ["plansRequired", "workspacesRequired", "tooManyAudience", "newUsersOutOfRange"].includes(error),
        schedule: ["windowInverted", "priorityOutOfRange"].includes(error),
      }
    : {};

  const showSidePreview = tab === "content" || tab === "design" || tab === "audience" || tab === "schedule";

  return (
    <AdminPage>
      {backLink}
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Megaphone size={14} weight="fill" />}
        title={announcement ? announcement.title : tEditor("newTitle")}
        description={tEditor("description")}
      />

      {announcement ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
          <CmsChip className={statusClasses(status)}>{t(`statuses.${status}`)}</CmsChip>
          <AnnouncementTypePill type={announcement.type} />
          <span>
            <WindowLine announcement={announcement} />
          </span>
          <span aria-hidden>·</span>
          <span>
            <AudienceLine announcement={announcement} />
          </span>
        </div>
      ) : null}

      {archived ? (
        <p className="mt-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12.5px] text-ink-muted">{tEditor("archivedNotice")}</p>
      ) : null}

      <div className="mt-5">
        <CmsTabBar<Tab>
          label={tEditor("tabsLabel")}
          value={tab}
          onChange={setTab}
          tabs={TABS.filter((value) => announcement || (value !== "history" && value !== "analytics")).map((value) => ({
            value,
            label: tEditor(`tabs.${value}`),
            badge: tabErrors[value] ? "!" : undefined,
          }))}
        />

        <div className={cn(showSidePreview && "grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]")}>
          <fieldset disabled={archived} className="min-w-0 disabled:opacity-70">
            <CmsTabPanel value="content" active={tab}>
              <ContentTab draft={draft} set={set} />
            </CmsTabPanel>
            <CmsTabPanel value="design" active={tab}>
              <DesignTab draft={draft} set={set} />
            </CmsTabPanel>
            <CmsTabPanel value="audience" active={tab}>
              <AudienceTab draft={draft} set={set} />
            </CmsTabPanel>
            <CmsTabPanel value="schedule" active={tab}>
              <ScheduleTab draft={draft} set={set} canSchedule={canSchedule} />
            </CmsTabPanel>
          </fieldset>

          {showSidePreview ? (
            <div className="min-w-0 pt-5 xl:sticky xl:top-4 xl:self-start">
              <AdminPanel className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[13px] font-semibold">{tEditor("previewTitle")}</h2>
                  <Button variant="ghost" size="sm" onClick={() => setTab("preview")}>
                    <Eye size={14} />
                    {tEditor("openPreview")}
                  </Button>
                </div>
                <AnnouncementPlacementPreview announcement={preview} placement={debouncedDraft.placement} device="desktop" dark={false} className="p-2 sm:p-2" />
              </AdminPanel>
            </div>
          ) : null}
        </div>

        <CmsTabPanel value="preview" active={tab}>
          <PreviewTab announcement={preview} placement={debouncedDraft.placement} />
        </CmsTabPanel>

        {announcement ? (
          <>
            <CmsTabPanel value="history" active={tab}>
              <AuditHistory entityType="Announcement" entityId={announcement.id} />
            </CmsTabPanel>
            <CmsTabPanel value="analytics" active={tab}>
              <AnalyticsTab announcementId={announcement.id} />
            </CmsTabPanel>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12.5px] text-destructive">
          {t(`errors.${error}`)}
        </p>
      ) : null}

      <CmsActionBar
        status={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <DirtyDot dirty={unsaved} />
            {announcement ? <EditedBy at={announcement.updatedAt} by={announcement.updatedBy ?? announcement.createdBy} /> : <span>{tEditor("notSavedYet")}</span>}
          </span>
        }
      >
        {!archived ? (
          <Button variant="outline" size="sm" onClick={handleSave} disabled={!canSave}>
            <FloppyDisk size={14} />
            {tEditor("saveDraft")}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => setTab("preview")}>
          <Eye size={14} />
          {t("actions.preview")}
        </Button>
        {announcement ? (
          <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={busy}>
            <Copy size={14} />
            {t("actions.duplicate")}
          </Button>
        ) : null}
        {actions.includes("unpublish") ? (
          <Button variant="outline" size="sm" onClick={askUnpublish} disabled={busy}>
            <ArrowCounterClockwise size={14} />
            {t("actions.unpublish")}
          </Button>
        ) : null}
        {actions.includes("restore") ? (
          <Button variant="outline" size="sm" onClick={() => void run(t("toasts.restored"), () => unpublish.mutateAsync(announcement!.id))} disabled={busy}>
            <ArrowCounterClockwise size={14} />
            {t("actions.restore")}
          </Button>
        ) : null}
        {announcement && actions.includes("archive") ? (
          <Button variant="outline" size="sm" onClick={askArchive} disabled={busy}>
            <Archive size={14} />
            {t("actions.archive")}
          </Button>
        ) : null}
        {announcement && actions.includes("delete") ? (
          <Button variant="destructive" size="sm" onClick={askDelete} disabled={busy}>
            <Trash size={14} />
            {t("actions.delete")}
          </Button>
        ) : null}
        {actions.includes("schedule") ? (
          <Button
            variant="outline"
            size="sm"
            onClick={askSchedule}
            disabled={!canSchedule || Boolean(error) || busy}
            title={canSchedule ? undefined : tEditor("scheduleNeedsFuture")}
          >
            <CalendarBlank size={14} />
            {tEditor("schedule")}
          </Button>
        ) : null}
        {actions.includes("publishNow") ? (
          <Button size="sm" onClick={askPublishNow} disabled={Boolean(error) || busy}>
            <PaperPlaneTilt size={14} />
            {dirty && announcement ? tEditor("saveAndPublish") : t("actions.publishNow")}
          </Button>
        ) : null}
      </CmsActionBar>
      {confirmDialog}
    </AdminPage>
  );
}

type Setter = <K extends keyof AnnouncementDraft>(field: K, value: AnnouncementDraft[K]) => void;

function Chooser<T extends string>({
  options,
  value,
  onChange,
  label,
  hint,
  columns = "sm:grid-cols-2",
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: (value: T) => string;
  hint?: (value: T) => string;
  columns?: string;
}) {
  return (
    <div role="radiogroup" className={cn("grid gap-2", columns)}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-lg border px-3 py-2 text-left transition-colors",
            value === option ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2",
          )}
        >
          <span className="block text-[13px] font-medium">{label(option)}</span>
          {hint ? <span className={cn("mt-0.5 block text-[11px]", value === option ? "text-surface-1/70" : "text-ink-subtle")}>{hint(option)}</span> : null}
        </button>
      ))}
    </div>
  );
}

function ContentTab({ draft, set }: { draft: AnnouncementDraft; set: Setter }) {
  const t = useTranslations("adminCms.announcements.editor");
  return (
    <div className="space-y-4">
      <AdminPanel className="space-y-4 p-4">
        <div>
          <Label className="text-[12px] text-ink-muted">{t("fields.type")}</Label>
          <div className="mt-1.5">
            <Chooser options={CMS_TYPES} value={draft.type} onChange={(value) => set("type", value)} label={(value) => t(`types.${value}.label`)} hint={(value) => t(`types.${value}.hint`)} />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="announcement-title" className="text-[12px] text-ink-muted">
              {t("fields.title")}
            </Label>
            <span className="text-[11px] tabular-nums text-ink-subtle">
              {draft.title.trim().length}/{LIMITS.title}
            </span>
          </div>
          <Input
            id="announcement-title"
            className="mt-1.5"
            value={draft.title}
            maxLength={LIMITS.title}
            placeholder={t("fields.titlePlaceholder")}
            onChange={(event) => set("title", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="announcement-body" className="text-[12px] text-ink-muted">
            {t("fields.body")}
          </Label>
          <div className="mt-1.5">
            <MarkdownEditor
              id="announcement-body"
              value={draft.bodyMarkdown}
              onChange={(value) => set("bodyMarkdown", value)}
              maxLength={LIMITS.body}
              placeholder={t("fields.bodyPlaceholder")}
              onImageUploaded={(path) => {
                if (!draft.imageUrl) set("imageUrl", path);
              }}
            />
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="space-y-3 p-4">
        <div>
          <h3 className="text-[13px] font-semibold">{t("fields.buttons")}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("fields.buttonsHint")}</p>
        </div>
        <CtaFields
          idPrefix="primary"
          title={t("fields.primary")}
          label={draft.ctaLabel}
          url={draft.ctaUrl}
          onLabel={(value) => set("ctaLabel", value)}
          onUrl={(value) => set("ctaUrl", value)}
        />
        <CtaFields
          idPrefix="secondary"
          title={t("fields.secondary")}
          label={draft.secondaryCtaLabel}
          url={draft.secondaryCtaUrl}
          onLabel={(value) => set("secondaryCtaLabel", value)}
          onUrl={(value) => set("secondaryCtaUrl", value)}
        />
      </AdminPanel>
    </div>
  );
}

function CtaFields({
  idPrefix,
  title,
  label,
  url,
  onLabel,
  onUrl,
}: {
  idPrefix: string;
  title: string;
  label: string;
  url: string;
  onLabel: (value: string) => void;
  onUrl: (value: string) => void;
}) {
  const t = useTranslations("adminCms.announcements.editor");
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <legend className="px-1 text-[11.5px] text-ink-subtle">{title}</legend>
      <div>
        <Label htmlFor={`${idPrefix}-label`} className="text-[12px] text-ink-muted">
          {t("fields.ctaLabel")}
        </Label>
        <Input id={`${idPrefix}-label`} className="mt-1.5" value={label} maxLength={LIMITS.ctaLabel} placeholder={t("fields.ctaLabelPlaceholder")} onChange={(event) => onLabel(event.target.value)} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-url`} className="text-[12px] text-ink-muted">
          {t("fields.ctaUrl")}
        </Label>
        <Input id={`${idPrefix}-url`} className="mt-1.5 font-mono text-[12.5px]" value={url} maxLength={LIMITS.ctaUrl} placeholder={t("fields.ctaUrlPlaceholder")} onChange={(event) => onUrl(event.target.value)} />
      </div>
    </fieldset>
  );
}

function DesignTab({ draft, set }: { draft: AnnouncementDraft; set: Setter }) {
  const t = useTranslations("adminCms.announcements.editor.design");
  const tPreview = useTranslations("adminCms.announcements.preview");
  const upload = useUploadAnnouncementAsset();
  const tCommon = useTranslations("adminCms.common");
  const image = resolveImage(draft.imageUrl);

  const uploadHero = async (file: File) => {
    if (file.size > LIMITS.assetBytes) {
      toast.error(tCommon("markdown.imageTooLarge"));
      return;
    }
    try {
      const asset = await upload.mutateAsync(file);
      set("imageUrl", asset.url);
    } catch (caught) {
      toast.error(getErrorMessage(caught, tCommon("markdown.uploadFailed")));
    }
  };

  return (
    <div className="space-y-4">
      <AdminPanel className="space-y-3 p-4">
        <div>
          <h3 className="text-[13px] font-semibold">{t("placement")}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("placementHint")}</p>
        </div>
        <Chooser<Placement>
          options={PLACEMENTS}
          value={draft.placement}
          onChange={(value) => set("placement", value)}
          label={(value) => tPreview(`placements.${value}`)}
          hint={(value) => t(`placementHints.${value}`)}
        />
      </AdminPanel>

      <AdminPanel className="space-y-4 p-4">
        <div>
          <Label className="text-[12px] text-ink-muted">{t("variant")}</Label>
          <div className="mt-1.5">
            <Chooser options={VARIANTS} value={draft.variant} onChange={(value) => set("variant", value)} label={(value) => t(`variants.${value}.label`)} hint={(value) => t(`variants.${value}.hint`)} columns="sm:grid-cols-3" />
          </div>
        </div>
        <div>
          <Label className="text-[12px] text-ink-muted">{t("color")}</Label>
          <div role="radiogroup" aria-label={t("color")} className="mt-1.5 flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={draft.accentColor === color}
                aria-label={t(`colors.${color}`)}
                title={t(`colors.${color}`)}
                onClick={() => set("accentColor", color)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border-2 transition-transform",
                  draft.accentColor === color ? "scale-110 border-ink" : "border-transparent",
                )}
              >
                <span className={cn("size-6 rounded-full", colorTokens(color).bar)} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-[12px] text-ink-muted">{t("icon")}</Label>
          <div role="radiogroup" aria-label={t("icon")} className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              role="radio"
              aria-checked={draft.icon === ""}
              onClick={() => set("icon", "")}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px]",
                draft.icon === "" ? "border-ink bg-surface-2" : "border-border hover:bg-surface-2",
              )}
            >
              <AnnouncementIcon name={iconFor(draft.type, null)} size={16} />
              {t("iconDefault")}
            </button>
            {ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                role="radio"
                aria-checked={draft.icon === icon}
                aria-label={icon}
                title={icon}
                onClick={() => set("icon", icon)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg border",
                  draft.icon === icon ? "border-ink bg-surface-2" : "border-border hover:bg-surface-2",
                )}
              >
                <AnnouncementIcon name={icon} size={16} />
              </button>
            ))}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="space-y-3 p-4">
        <div>
          <h3 className="text-[13px] font-semibold">{t("image")}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("imageHint")}</p>
        </div>
        {image ? (
          <div className="relative overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded asset on the API origin */}
            <img src={image} alt="" className="aspect-[16/7] w-full object-cover" />
            <Button variant="outline" size="icon-sm" className="absolute right-2 top-2 bg-surface-1" aria-label={t("removeImage")} onClick={() => set("imageUrl", "")}>
              <X size={14} />
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] hover:bg-surface-2", upload.isPending && "pointer-events-none opacity-60")}>
            {upload.isPending ? <CircleNotch size={14} className="animate-spin" /> : <ImageSquare size={14} />}
            {t("uploadImage")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadHero(file);
                event.target.value = "";
              }}
            />
          </label>
          <Input
            aria-label={t("imageUrl")}
            className="min-w-[240px] flex-1 font-mono text-[12px]"
            placeholder="https://…"
            value={draft.imageUrl}
            onChange={(event) => set("imageUrl", event.target.value.trim())}
          />
        </div>
        {draft.placement !== "MODAL" && draft.placement !== "DASHBOARD_CARD" && draft.imageUrl ? (
          <p className="text-[11.5px] text-ink-subtle">{t("imageNotShown")}</p>
        ) : null}
      </AdminPanel>
    </div>
  );
}

function AudienceTab({ draft, set }: { draft: AnnouncementDraft; set: Setter }) {
  const t = useTranslations("adminCms.announcements.editor");
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  return (
    <div className="space-y-4">
      <AdminPanel className="space-y-3 p-4">
        <Label className="text-[12px] text-ink-muted">{t("fields.audience")}</Label>
        <Chooser
          options={AUDIENCE_MODES}
          value={draft.audienceMode}
          onChange={(value) => set("audienceMode", value)}
          label={(value) => t(`audienceModes.${value}.label`)}
          hint={(value) => t(`audienceModes.${value}.hint`)}
          columns="sm:grid-cols-3"
        />
        {draft.audienceMode === "PLANS" ? <PlanPicker selected={draft.planSlugs} onChange={(slugs) => set("planSlugs", slugs)} /> : null}
        {draft.audienceMode === "WORKSPACES" ? <WorkspacePicker selected={draft.workspaceIds} onChange={(ids) => set("workspaceIds", ids)} /> : null}
      </AdminPanel>

      <AdminPanel className="space-y-4 p-4">
        <div>
          <h3 className="text-[13px] font-semibold">{t("targeting.title")}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("targeting.description")}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-muted">{t("targeting.roles")}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ROLES.map((role) => (
              <TogglePill key={role} on={draft.targetRoles.includes(role)} onClick={() => set("targetRoles", toggle(draft.targetRoles, role))}>
                {t(`targeting.roleNames.${role}`)}
              </TogglePill>
            ))}
          </div>
          <p className="mt-1 text-[11.5px] text-ink-subtle">{draft.targetRoles.length ? t("targeting.rolesSome") : t("targeting.rolesAny")}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-muted">{t("targeting.locales")}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {LOCALES.map((locale) => (
              <TogglePill key={locale} on={draft.targetLocales.includes(locale)} onClick={() => set("targetLocales", toggle(draft.targetLocales, locale))}>
                {t(`targeting.localeNames.${locale}`)}
              </TogglePill>
            ))}
          </div>
          <p className="mt-1 text-[11.5px] text-ink-subtle">{draft.targetLocales.length ? t("targeting.localesSome") : t("targeting.localesAny")}</p>
        </div>
        <div className="max-w-xs">
          <Label htmlFor="new-users" className="text-[12px] text-ink-muted">
            {t("targeting.newUsers")}
          </Label>
          <Input
            id="new-users"
            type="number"
            min={1}
            max={LIMITS.newUserDays}
            className="mt-1.5"
            placeholder={t("targeting.newUsersPlaceholder")}
            value={draft.newUsersWithinDays}
            onChange={(event) => set("newUsersWithinDays", event.target.value)}
          />
          <p className="mt-1 text-[11.5px] text-ink-subtle">{t("targeting.newUsersHint")}</p>
        </div>
      </AdminPanel>
    </div>
  );
}

function TogglePill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-[12px] transition-colors", on ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2")}
    >
      {children}
    </button>
  );
}

function ScheduleTab({ draft, set, canSchedule }: { draft: AnnouncementDraft; set: Setter; canSchedule: boolean }) {
  const t = useTranslations("adminCms.announcements.editor");
  return (
    <div className="space-y-4">
      <AdminPanel id="schedule" className="space-y-3 p-4">
        <div>
          <h3 className="text-[13px] font-semibold">{t("fields.window")}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("fields.windowHint")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="announcement-starts" className="text-[12px] text-ink-muted">
              {t("fields.startsAt")}
            </Label>
            <Input id="announcement-starts" type="datetime-local" className="mt-1.5" value={draft.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="announcement-ends" className="text-[12px] text-ink-muted">
              {t("fields.endsAt")}
            </Label>
            <Input id="announcement-ends" type="datetime-local" className="mt-1.5" value={draft.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
          </div>
        </div>
        <p className="text-[12px] text-ink-subtle">{canSchedule ? t("scheduleHint") : t("scheduleNeedsFuture")}</p>
      </AdminPanel>

      <AdminPanel className="space-y-4 p-4">
        <div>
          <h3 className="text-[13px] font-semibold">{t("delivery.title")}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("delivery.description")}</p>
        </div>
        <div>
          <Label className="text-[12px] text-ink-muted">{t("delivery.frequency")}</Label>
          <div className="mt-1.5">
            <Chooser
              options={FREQUENCIES}
              value={draft.frequency}
              onChange={(value) => set("frequency", value)}
              label={(value) => t(`delivery.frequencies.${value}.label`)}
              hint={(value) => t(`delivery.frequencies.${value}.hint`)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="priority" className="text-[12px] text-ink-muted">
              {t("delivery.priority")}
            </Label>
            <Input
              id="priority"
              type="number"
              min={0}
              max={LIMITS.priority}
              className="mt-1.5"
              value={String(draft.priority)}
              onChange={(event) => set("priority", Number(event.target.value) || 0)}
            />
            <p className="mt-1 text-[11.5px] text-ink-subtle">{t("delivery.priorityHint")}</p>
          </div>
          <div>
            <p className="text-[12px] text-ink-muted">{t("delivery.dismissible")}</p>
            <label className="mt-2.5 flex items-center gap-2 text-[12.5px] text-ink">
              <Switch checked={draft.dismissible} onCheckedChange={(checked) => set("dismissible", Boolean(checked))} />
              {draft.dismissible ? t("delivery.dismissibleOn") : t("delivery.dismissibleOff")}
            </label>
            <p className="mt-1 text-[11.5px] text-ink-subtle">{t("delivery.dismissibleHint")}</p>
          </div>
        </div>
      </AdminPanel>
    </div>
  );
}

function PreviewTab({ announcement, placement }: { announcement: AnnouncementViewModel; placement: Placement }) {
  const t = useTranslations("adminCms.announcements.preview");
  const tCommon = useTranslations("adminCms.common.preview");
  const [shown, setShown] = useState<Placement>(placement);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [dark, setDark] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={t("placementLabel")} className="flex flex-wrap gap-1">
          {PLACEMENTS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={shown === value}
              onClick={() => setShown(value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px]",
                shown === value ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2",
              )}
            >
              {t(`placements.${value}`)}
              {value === placement ? ` · ${t("chosen")}` : ""}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border p-0.5">
          {(["desktop", "mobile"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={device === value}
              onClick={() => setDevice(value)}
              className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-muted", device === value && "bg-surface-2 text-ink")}
            >
              {value === "desktop" ? <Desktop size={14} /> : <DeviceMobile size={14} />}
              {tCommon(value)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={dark === value}
              onClick={() => setDark(value)}
              className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-muted", dark === value && "bg-surface-2 text-ink")}
            >
              {value ? <Moon size={14} /> : <Sun size={14} />}
              {value ? tCommon("dark") : tCommon("light")}
            </button>
          ))}
        </div>
      </div>
      {shown !== placement ? <p className="text-[12px] text-amber-700 dark:text-amber-300">{t("otherPlacement")}</p> : null}
      <AnnouncementPlacementPreview announcement={announcement} placement={shown} device={device} dark={dark} />
    </div>
  );
}

function AnalyticsTab({ announcementId }: { announcementId: string }) {
  const t = useTranslations("adminCms.announcements.analytics");
  const [days, setDays] = useState(30);
  const analytics = useAnnouncementAnalytics(announcementId, days);
  const data = analytics.data;
  const format = (value: number) => value.toLocaleString();
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const tiles = data
    ? [
        { label: t("impressions"), value: format(data.totals.impressions), caption: t("uniqueViewers", { count: data.totals.uniqueViewers }) },
        { label: t("ctaClicks"), value: format(data.totals.ctaClicks), caption: t("secondaryClicks", { count: data.totals.secondaryClicks }) },
        { label: t("clickThrough"), value: percent(data.totals.clickThroughRate), caption: t("uniqueClickers", { count: data.totals.uniqueCtaClickers }) },
        { label: t("dismissals"), value: format(data.totals.dismissals), caption: t("dismissRate", { rate: percent(data.totals.dismissRate) }) },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[12px] text-ink-muted">{t("description")}</p>
        <select
          aria-label={t("range")}
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink"
        >
          {[7, 30, 90].map((value) => (
            <option key={value} value={value}>
              {t("lastDays", { days: value })}
            </option>
          ))}
        </select>
      </div>
      {analytics.isError ? <p className="text-[12.5px] text-destructive">{t("error")}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(tiles.length ? tiles : Array.from({ length: 4 }, () => null)).map((tile, index) =>
          tile ? (
            <AdminPanel key={tile.label} className="p-4">
              <p className="text-[11.5px] text-ink-muted">{tile.label}</p>
              <ChartFigure value={tile.value} caption={tile.caption} className="mb-0 mt-1" />
            </AdminPanel>
          ) : (
            <div key={index} className="h-[92px] animate-pulse rounded-lg bg-surface-2" />
          ),
        )}
      </div>
      <AdminPanel className="p-4">
        {data && data.daily.some((point) => point.impressions || point.ctaClicks || point.dismissals) ? (
          <TimeSeriesChart
            labels={data.daily.map((point) => point.day.slice(5))}
            titles={data.daily.map((point) => point.day)}
            series={[
              { key: "impressions", label: t("impressions"), values: data.daily.map((point) => point.impressions), color: CHART_COLORS.primary },
              { key: "clicks", label: t("ctaClicks"), values: data.daily.map((point) => point.ctaClicks + point.secondaryClicks), color: CHART_COLORS.secondary },
            ]}
            variant="line"
            integer
            height={220}
            formatValue={format}
            ariaLabel={t("chartLabel")}
          />
        ) : (
          <ChartEmpty height={220}>{analytics.isPending ? t("loading") : t("empty")}</ChartEmpty>
        )}
      </AdminPanel>
    </div>
  );
}

/** Plans come from the billing catalogue; a slug already on the announcement stays even if retired. */
function PlanPicker({ selected, onChange }: { selected: string[]; onChange: (slugs: string[]) => void }) {
  const t = useTranslations("adminCms.announcements.editor.plans");
  const plans = useAdminPlans();
  const catalog = plans.data ?? [];
  const known = new Set(catalog.map((plan) => plan.slug.toLowerCase()));
  const orphans = selected.filter((slug) => !known.has(slug.toLowerCase()));

  const toggle = (slug: string) => onChange(selected.includes(slug) ? selected.filter((value) => value !== slug) : [...selected, slug]);

  if (plans.isError) return <p className="text-[12px] text-destructive">{t("error")}</p>;
  if (plans.isPending) return <p className="text-[12px] text-ink-muted">{t("loading")}</p>;

  return (
    <div>
      <p className="text-[12px] text-ink-muted">{t("label")}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {catalog.map((plan) => {
          const slug = plan.slug.toLowerCase();
          const on = selected.includes(slug);
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => toggle(slug)}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] transition-colors",
                on ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2",
                !plan.isActive && "opacity-60",
              )}
            >
              {plan.name} <span className={on ? "text-surface-1/70" : "text-ink-subtle"}>· {slug}</span>
            </button>
          );
        })}
        {orphans.map((slug) => (
          <button key={slug} type="button" onClick={() => toggle(slug)} className="rounded-full border border-ink bg-ink px-3 py-1 text-[12px] text-surface-1" title={t("retired")}>
            {slug}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceChip({ id, onRemove }: { id: string; onRemove: () => void }) {
  const workspace = useAdminWorkspaceByRef(id);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pl-2.5 pr-1 text-[12px]">
      <span className="max-w-[220px] truncate">{workspace.data?.name ?? id.slice(0, 8)}</span>
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 text-ink-subtle hover:bg-surface-3 hover:text-ink">
        <X size={11} />
      </button>
    </span>
  );
}

function WorkspacePicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("adminCms.announcements.editor.workspaces");
  const [search, setSearch] = useState("");
  const query = useMemo(() => ({ page: 1, pageSize: 8, search: search.trim() }), [search]);
  const directory = useAdminWorkspaceDirectory(query, { enabled: Boolean(search.trim()) });
  const results = search.trim() ? (directory.data?.items ?? []) : [];

  return (
    <div className="space-y-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <WorkspaceChip key={id} id={id} onRemove={() => onChange(selected.filter((value) => value !== id))} />
          ))}
        </div>
      ) : null}
      <div className="relative">
        <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <Input className="pl-8" placeholder={t("searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {search.trim() ? (
        <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
          {directory.isPending ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">{t("searching")}</p>
          ) : directory.isError ? (
            <p className="px-3 py-3 text-[12px] text-destructive">{t("error")}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">{t("noMatch")}</p>
          ) : (
            <ul>
              {results.map((workspace) => {
                const added = selected.includes(workspace.id);
                return (
                  <li key={workspace.id}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => onChange([...selected, workspace.id])}
                      className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-surface-2 disabled:opacity-50"
                    >
                      <span className="truncate text-[13px] text-ink">{workspace.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-subtle">{added ? t("added") : t("memberCount", { count: workspace.memberCount })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
