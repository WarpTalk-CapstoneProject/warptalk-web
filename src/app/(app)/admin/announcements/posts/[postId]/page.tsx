"use client";

/**
 * One announcement's editor, with the preview of what users will see beside it.
 *
 * `/admin/announcements/posts/new` starts a draft; saving it creates the row and moves the URL to
 * its id. Publish now and Schedule save first when there are unsaved changes, so what goes live is
 * always what is on screen. The lifecycle buttons are exactly the transitions the server allows
 * for the current status (availableActions), never a button the server would refuse.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  CalendarBlank,
  Copy,
  FloppyDisk,
  MagnifyingGlass,
  Megaphone,
  PaperPlaneTilt,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { WindowLine } from "@/components/admin/cms/announcement-bits";
import { AnnouncementUserPreview } from "@/components/admin/cms/announcement-preview-dialog";
import { CmsChip, EditedBy } from "@/components/admin/cms/cms-shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminAnnouncementCms,
  useArchiveAnnouncement,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useDuplicateAnnouncement,
  usePublishAnnouncement,
  useUnpublishAnnouncement,
  useUpdateAnnouncement,
} from "@/hooks/use-admin-announcement-cms";
import { useAdminPlans } from "@/hooks/use-admin-pricing";
import { useAdminWorkspaceByRef, useAdminWorkspaceDirectory } from "@/hooks/use-admin-workspaces";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  AUDIENCE_MODES,
  availableActions,
  CMS_TYPES,
  draftFrom,
  emptyDraft,
  LIMITS,
  sameDraft,
  statusClasses,
  toRequest,
  toUtcIso,
  validateDraft,
  type AnnouncementDraft,
  type CmsAction,
  type EffectiveStatus,
} from "@/lib/announcements/announcement-cms";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminAnnouncementCmsDto } from "@/types/admin-cms";

export default function AnnouncementEditorPage() {
  const params = useParams<{ postId: string }>();
  const isNew = params.postId === "new";
  const t = useTranslations("adminCms.announcements.editor");
  const detail = useAdminAnnouncementCms(isNew ? undefined : params.postId);

  const backLink = (
    <Link
      href="/admin/announcements"
      className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink"
    >
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

function Editor({
  announcement,
  backLink,
}: {
  announcement: AdminAnnouncementCmsDto | null;
  backLink: React.ReactNode;
}) {
  const t = useTranslations("adminCms.announcements");
  const tEditor = useTranslations("adminCms.announcements.editor");
  const router = useRouter();

  const initial = useMemo(() => (announcement ? draftFrom(announcement) : emptyDraft()), [announcement]);
  const [draft, setDraft] = useState<AnnouncementDraft>(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const busy =
    create.isPending ||
    update.isPending ||
    publish.isPending ||
    unpublish.isPending ||
    archive.isPending ||
    duplicate.isPending ||
    remove.isPending;

  const status = (announcement?.effectiveStatus ?? "DRAFT") as EffectiveStatus;
  const actions: CmsAction[] = announcement ? availableActions(status) : ["publishNow", "schedule"];
  const dirty = !announcement || !sameDraft(draft, initial);
  const error = validateDraft(draft);
  const archived = status === "ARCHIVED";
  const scheduledStart = toUtcIso(draft.startsAt);
  const canSchedule = Boolean(scheduledStart && Date.parse(scheduledStart) > now);
  // Memoised before debouncing: a fresh object every render would restart the timer forever.
  const request = useMemo(() => toRequest(draft), [draft]);
  const preview = useDebouncedValue(request, 150);

  useEffect(() => {
    if (!dirty || !announcement) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, announcement]);

  const set = <K extends keyof AnnouncementDraft>(field: K, value: AnnouncementDraft[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  /** Saves what is on screen and returns the id it lives under. */
  const persist = async (): Promise<string> => {
    const request = toRequest(draft);
    if (!announcement) {
      const created = await create.mutateAsync(request);
      router.replace(`/admin/announcements/posts/${created.id}`);
      return created.id;
    }
    if (dirty) await update.mutateAsync({ id: announcement.id, request });
    return announcement.id;
  };

  const run = async (success: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast.success(success);
    } catch (caught) {
      toast.error(getErrorMessage(caught, t("toasts.failed")));
    }
  };

  const handleSave = () => void run(t("toasts.saved"), persist);
  const handlePublishNow = () =>
    void run(t("toasts.published"), async () => {
      const id = await persist();
      await publish.mutateAsync({ id, request: {} });
    });
  const handleSchedule = () =>
    void run(t("toasts.scheduled"), async () => {
      const id = await persist();
      await publish.mutateAsync({ id, request: { startsAt: scheduledStart } });
    });

  return (
    <AdminPage>
      {backLink}
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Megaphone size={14} weight="fill" />}
        title={announcement ? announcement.title : tEditor("newTitle")}
        description={tEditor("description")}
        actions={
          <>
            {announcement && actions.includes("duplicate") ? (
              <Button
                variant="outline"
                size="sm"
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
              </Button>
            ) : null}
            {!archived ? (
              <Button variant="outline" size="sm" onClick={handleSave} disabled={!dirty || Boolean(error) || busy}>
                <FloppyDisk size={14} />
                {announcement ? tEditor("save") : tEditor("saveDraft")}
              </Button>
            ) : null}
            {actions.includes("publishNow") ? (
              <Button size="sm" onClick={handlePublishNow} disabled={Boolean(error) || busy}>
                <PaperPlaneTilt size={14} />
                {dirty && announcement ? tEditor("saveAndPublish") : t("actions.publishNow")}
              </Button>
            ) : null}
          </>
        }
      />

      {announcement ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
          <CmsChip className={statusClasses(status)}>{t(`statuses.${status}`)}</CmsChip>
          <span>
            <WindowLine announcement={announcement} />
          </span>
          <span aria-hidden>·</span>
          <EditedBy at={announcement.updatedAt} by={announcement.updatedBy ?? announcement.createdBy} />
        </div>
      ) : null}

      {archived ? (
        <p className="mt-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12.5px] text-ink-muted">
          {tEditor("archivedNotice")}
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-4">
        {/* An archived announcement is read-only until it is restored to drafts; the lifecycle
            panel below stays outside the fieldset so Restore remains clickable. */}
        <fieldset disabled={archived} className="min-w-0 space-y-4 disabled:opacity-70">
          <AdminPanel className="space-y-4 p-4">
            <div>
              <Label className="text-[12px] text-ink-muted">{tEditor("fields.type")}</Label>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {CMS_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set("type", type)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      draft.type === type ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <span className="block text-[13px] font-medium">{tEditor(`types.${type}.label`)}</span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px]",
                        draft.type === type ? "text-surface-1/70" : "text-ink-subtle",
                      )}
                    >
                      {tEditor(`types.${type}.hint`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="announcement-title" className="text-[12px] text-ink-muted">
                  {tEditor("fields.title")}
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
                placeholder={tEditor("fields.titlePlaceholder")}
                onChange={(event) => set("title", event.target.value)}
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="announcement-body" className="text-[12px] text-ink-muted">
                  {tEditor("fields.body")}
                </Label>
                <span className="text-[11px] text-ink-subtle">{tEditor("fields.bodyHint")}</span>
              </div>
              <Textarea
                id="announcement-body"
                className="mt-1.5 min-h-[200px] font-mono text-[12.5px] leading-relaxed"
                value={draft.bodyMarkdown}
                maxLength={LIMITS.body}
                placeholder={tEditor("fields.bodyPlaceholder")}
                onChange={(event) => set("bodyMarkdown", event.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div>
                <Label htmlFor="announcement-cta-label" className="text-[12px] text-ink-muted">
                  {tEditor("fields.ctaLabel")}
                </Label>
                <Input
                  id="announcement-cta-label"
                  className="mt-1.5"
                  value={draft.ctaLabel}
                  maxLength={LIMITS.ctaLabel}
                  placeholder={tEditor("fields.ctaLabelPlaceholder")}
                  onChange={(event) => set("ctaLabel", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="announcement-cta-url" className="text-[12px] text-ink-muted">
                  {tEditor("fields.ctaUrl")}
                </Label>
                <Input
                  id="announcement-cta-url"
                  className="mt-1.5 font-mono text-[12.5px]"
                  value={draft.ctaUrl}
                  maxLength={LIMITS.ctaUrl}
                  placeholder={tEditor("fields.ctaUrlPlaceholder")}
                  onChange={(event) => set("ctaUrl", event.target.value)}
                />
              </div>
            </div>
          </AdminPanel>

          <AdminPanel className="space-y-3 p-4">
            <Label className="text-[12px] text-ink-muted">{tEditor("fields.audience")}</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {AUDIENCE_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set("audienceMode", mode)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    draft.audienceMode === mode ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2",
                  )}
                >
                  <span className="block text-[13px] font-medium">{tEditor(`audienceModes.${mode}.label`)}</span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[11px]",
                      draft.audienceMode === mode ? "text-surface-1/70" : "text-ink-subtle",
                    )}
                  >
                    {tEditor(`audienceModes.${mode}.hint`)}
                  </span>
                </button>
              ))}
            </div>
            {draft.audienceMode === "PLANS" ? (
              <PlanPicker selected={draft.planSlugs} onChange={(slugs) => set("planSlugs", slugs)} />
            ) : null}
            {draft.audienceMode === "WORKSPACES" ? (
              <WorkspacePicker selected={draft.workspaceIds} onChange={(ids) => set("workspaceIds", ids)} />
            ) : null}
          </AdminPanel>

          <AdminPanel id="schedule" className="space-y-3 p-4">
            <div>
              <Label className="text-[12px] text-ink-muted">{tEditor("fields.window")}</Label>
              <p className="mt-0.5 text-[12px] text-ink-subtle">{tEditor("fields.windowHint")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="announcement-starts" className="text-[12px] text-ink-muted">
                  {tEditor("fields.startsAt")}
                </Label>
                <Input
                  id="announcement-starts"
                  type="datetime-local"
                  className="mt-1.5"
                  value={draft.startsAt}
                  onChange={(event) => set("startsAt", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="announcement-ends" className="text-[12px] text-ink-muted">
                  {tEditor("fields.endsAt")}
                </Label>
                <Input
                  id="announcement-ends"
                  type="datetime-local"
                  className="mt-1.5"
                  value={draft.endsAt}
                  onChange={(event) => set("endsAt", event.target.value)}
                />
              </div>
            </div>
            {actions.includes("schedule") ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleSchedule} disabled={!canSchedule || Boolean(error) || busy}>
                  <CalendarBlank size={14} />
                  {tEditor("schedule")}
                </Button>
                <span className="text-[12px] text-ink-subtle">
                  {canSchedule ? tEditor("scheduleHint") : tEditor("scheduleNeedsFuture")}
                </span>
              </div>
            ) : null}
          </AdminPanel>

        </fieldset>

          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12.5px] text-destructive">
              {t(`errors.${error}`)}
            </p>
          ) : null}

          {announcement ? (
            <AdminPanel className="flex flex-wrap items-center gap-2 p-4">
              <span className="mr-auto text-[12px] text-ink-muted">{tEditor("lifecycle")}</span>
              {actions.includes("unpublish") ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(t("toasts.unpublished"), () => unpublish.mutateAsync(announcement.id))}
                >
                  <ArrowCounterClockwise size={14} />
                  {t("actions.unpublish")}
                </Button>
              ) : null}
              {actions.includes("restore") ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(t("toasts.restored"), () => unpublish.mutateAsync(announcement.id))}
                >
                  <ArrowCounterClockwise size={14} />
                  {t("actions.restore")}
                </Button>
              ) : null}
              {actions.includes("archive") ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(t("toasts.archived"), () => archive.mutateAsync(announcement.id))}
                >
                  <Archive size={14} />
                  {t("actions.archive")}
                </Button>
              ) : null}
              {actions.includes("delete") ? (
                <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  <Trash size={14} />
                  {t("actions.delete")}
                </Button>
              ) : null}
            </AdminPanel>
          ) : null}
        </div>

        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <AdminPanel className="p-4">
            <h2 className="text-[13px] font-semibold">{tEditor("previewTitle")}</h2>
            <p className="mt-0.5 mb-4 text-[12px] text-ink-muted">{tEditor("previewDescription")}</p>
            <AnnouncementUserPreview
              announcement={{
                title: preview.title || tEditor("previewPlaceholderTitle"),
                bodyMarkdown: preview.bodyMarkdown || tEditor("previewPlaceholderBody"),
                type: preview.type,
                ctaLabel: preview.ctaLabel,
                ctaUrl: preview.ctaUrl,
              }}
            />
          </AdminPanel>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
            <DialogDescription>{t("deleteDialog.description", { title: announcement?.title ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t("deleteDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run(t("toasts.deleted"), async () => {
                  if (!announcement) return;
                  await remove.mutateAsync(announcement.id);
                  router.push("/admin/announcements");
                })
              }
            >
              {t("deleteDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}

/** Plans come from the billing catalogue; a slug already on the announcement stays even if retired. */
function PlanPicker({ selected, onChange }: { selected: string[]; onChange: (slugs: string[]) => void }) {
  const t = useTranslations("adminCms.announcements.editor.plans");
  const plans = useAdminPlans();
  const catalog = plans.data ?? [];
  const known = new Set(catalog.map((plan) => plan.slug.toLowerCase()));
  const orphans = selected.filter((slug) => !known.has(slug.toLowerCase()));

  const toggle = (slug: string) =>
    onChange(selected.includes(slug) ? selected.filter((value) => value !== slug) : [...selected, slug]);

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
          <button
            key={slug}
            type="button"
            onClick={() => toggle(slug)}
            className="rounded-full border border-ink bg-ink px-3 py-1 text-[12px] text-surface-1"
            title={t("retired")}
          >
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
        <Input
          className="pl-8"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
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
                      <span className="shrink-0 text-[11px] text-ink-subtle">
                        {added ? t("added") : t("memberCount", { count: workspace.memberCount })}
                      </span>
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
