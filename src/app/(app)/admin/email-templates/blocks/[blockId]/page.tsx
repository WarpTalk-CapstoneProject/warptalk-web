"use client";

/**
 * One layout or reusable block.
 *
 * Like email content, a block has a draft and a published side, and senders only ever read the
 * published one — so an edit here changes no email until Publish, and then changes every email
 * that uses it (listed on the "Used by" tab, and in the publish confirmation).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  Copy,
  Eye,
  FloppyDisk,
  Stack,
  Star,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
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
import { AuditHistory, VersionHistory } from "@/components/admin/cms/cms-history";
import { CmsEmptyState } from "@/components/admin/cms/cms-list";
import { CHIP_TONES, CmsChip, EditedBy } from "@/components/admin/cms/cms-shared";
import {
  DEFAULT_PREVIEW_OPTIONS,
  EmailPreviewFrame,
  PreviewControls,
  type PreviewOptions,
} from "@/components/admin/cms/email-preview-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useArchiveEmailBlock,
  useDeleteEmailBlock,
  useDiscardEmailBlockDraft,
  useDuplicateEmailBlock,
  useEmailBlock,
  useEmailBlockPreview,
  useEmailBlockVersions,
  usePublishEmailBlock,
  useRestoreEmailBlockVersion,
  useSaveEmailBlockDraft,
  useSetDefaultEmailLayout,
  useUnarchiveEmailBlock,
} from "@/hooks/use-admin-email-blocks";
import { useAdminEmailTemplates } from "@/hooks/use-admin-email-templates";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { blockInclude, blockStatus, BLOCK_KEY_PATTERN, slugify } from "@/lib/admin/email-template-editor";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { EMAIL_LOCALES, type EmailBlockDto, type EmailBlockKind, type EmailBlockPreviewRequest } from "@/types/admin-cms";

const TABS = ["content", "preview", "usage", "history"] as const;
type Tab = (typeof TABS)[number];

export default function EmailBlockPage() {
  const params = useParams<{ blockId: string }>();
  const t = useTranslations("adminCms.blockEditor");
  const block = useEmailBlock(params.blockId);

  const backLink = (
    <Link
      href={block.data?.kind === "LAYOUT" ? "/admin/email-templates#layouts" : "/admin/email-templates#blocks"}
      className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink"
    >
      <ArrowLeft size={12} />
      {t("back")}
    </Link>
  );

  if (block.isError) {
    const notFound = apiErrorCode(block.error) === 404;
    return (
      <AdminPage>
        {backLink}
        <AdminPanel className="flex items-start gap-3 px-4 py-10 text-sm">
          <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">{notFound ? t("notFound") : t("loadError")}</p>
            {!notFound ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void block.refetch()}>
                {t("retry")}
              </Button>
            ) : null}
          </div>
        </AdminPanel>
      </AdminPage>
    );
  }
  if (!block.data) {
    return (
      <AdminPage>
        {backLink}
        <div className="h-8 w-72 animate-pulse rounded bg-surface-2" />
        <div className="mt-6 h-[480px] animate-pulse rounded-lg bg-surface-2" />
      </AdminPage>
    );
  }
  return (
    <Editor
      key={`${block.data.id}:${block.data.draftUpdatedAt}:${block.data.publishedVersion}:${block.data.status}:${block.data.isDefault}`}
      block={block.data}
      backLink={backLink}
    />
  );
}

interface BlockDraft {
  name: string;
  description: string;
  html: string;
  text: string;
  darkCss: string;
}

function draftOf(block: EmailBlockDto): BlockDraft {
  return {
    name: block.name,
    description: block.description ?? "",
    html: block.draft.html,
    text: block.draft.text ?? "",
    darkCss: block.draft.darkCss ?? "",
  };
}

function sameDraft(a: BlockDraft, b: BlockDraft) {
  return a.name === b.name && a.description === b.description && a.html === b.html && a.text === b.text && a.darkCss === b.darkCss;
}

function Editor({ block, backLink }: { block: EmailBlockDto; backLink: React.ReactNode }) {
  const t = useTranslations("adminCms.blockEditor");
  const tCommon = useTranslations("adminCms.common");
  const router = useRouter();
  const kind = block.kind as EmailBlockKind;
  const isLayout = kind === "LAYOUT";
  const [tab, setTab] = useHashTab(TABS, "content");
  const initial = useMemo(() => draftOf(block), [block]);
  const [draft, setDraft] = useState<BlockDraft>(initial);
  const [previewOptions, setPreviewOptions] = useState<PreviewOptions>(DEFAULT_PREVIEW_OPTIONS);
  const [previewTemplate, setPreviewTemplate] = useState<string>("");
  const [previewLocale, setPreviewLocale] = useState<string>("en");
  const [confirm, confirmDialog] = useConfirm();
  const noteRef = useRef("");
  const copyNameRef = useRef("");

  const save = useSaveEmailBlockDraft();
  const publish = usePublishEmailBlock();
  const discard = useDiscardEmailBlockDraft();
  const duplicate = useDuplicateEmailBlock();
  const archive = useArchiveEmailBlock();
  const unarchive = useUnarchiveEmailBlock();
  const setDefault = useSetDefaultEmailLayout();
  const remove = useDeleteEmailBlock();
  const restore = useRestoreEmailBlockVersion();
  const templates = useAdminEmailTemplates();
  const versions = useEmailBlockVersions(block.id);
  const busy = [save, publish, discard, duplicate, archive, unarchive, setDefault, remove, restore].some((mutation) => mutation.isPending);

  const status = blockStatus(block);
  const archived = status === "ARCHIVED";
  const dirty = !sameDraft(draft, initial);
  useUnsavedGuard(dirty);

  const previewRequest = useMemo<EmailBlockPreviewRequest>(
    () => ({
      html: draft.html,
      text: isLayout && draft.text.trim() ? draft.text : null,
      darkCss: isLayout && draft.darkCss.trim() ? draft.darkCss : null,
      templateKey: previewTemplate || null,
      locale: previewLocale,
      dark: previewOptions.dark,
    }),
    [draft.html, draft.text, draft.darkCss, isLayout, previewTemplate, previewLocale, previewOptions.dark],
  );
  const debounced = useDebouncedValue(previewRequest, 350);
  const preview = useEmailBlockPreview(kind, debounced);
  const issues = preview.data?.issues ?? [];

  const run = async (success: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast.success(success);
    } catch (caught) {
      toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
    }
  };

  const persist = useCallback(
    () =>
      save.mutateAsync({
        id: block.id,
        request: {
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          html: draft.html,
          text: isLayout && draft.text.trim() ? draft.text : null,
          darkCss: isLayout && draft.darkCss.trim() ? draft.darkCss : null,
          expectedDraftUpdatedAt: block.draftUpdatedAt,
        },
      }),
    [save, block.id, block.draftUpdatedAt, draft, isLayout],
  );

  const canSave = dirty && !archived && !busy && Boolean(draft.name.trim());
  const handleSave = () => {
    if (canSave) void run(t("toasts.saved"), persist);
  };
  useSaveShortcut(handleSave, canSave);

  const askPublish = () => {
    noteRef.current = "";
    confirm({
      title: t("publishDialog.title", { name: draft.name }),
      description:
        block.usedBy.length > 0
          ? t("publishDialog.descriptionUsed", { count: block.usedBy.length, list: block.usedBy.slice(0, 6).join(", ") })
          : t("publishDialog.descriptionUnused"),
      confirmLabel: t("publishDialog.confirm"),
      body: (
        <div>
          <Label htmlFor="block-publish-note" className="text-[12px] text-ink-muted">
            {t("publishDialog.note")}
          </Label>
          <Input id="block-publish-note" className="mt-1.5" maxLength={500} onChange={(event) => (noteRef.current = event.target.value)} />
        </div>
      ),
      onConfirm: () =>
        run(t("toasts.published"), async () => {
          if (dirty) await persist();
          await publish.mutateAsync({
            id: block.id,
            request: { note: noteRef.current.trim() || null, expectedPublishedVersion: block.publishedVersion },
          });
        }),
    });
  };

  const askDuplicate = () => {
    copyNameRef.current = t("copyName", { name: block.name });
    confirm({
      title: t("duplicateDialog.title"),
      description: t("duplicateDialog.description"),
      confirmLabel: t("duplicateDialog.confirm"),
      body: (
        <div>
          <Label htmlFor="block-copy-name" className="text-[12px] text-ink-muted">
            {t("duplicateDialog.name")}
          </Label>
          <Input
            id="block-copy-name"
            className="mt-1.5"
            defaultValue={copyNameRef.current}
            maxLength={120}
            onChange={(event) => (copyNameRef.current = event.target.value)}
          />
        </div>
      ),
      onConfirm: () =>
        run(t("toasts.duplicated"), async () => {
          const name = copyNameRef.current.trim() || block.name;
          let key = slugify(name);
          if (!BLOCK_KEY_PATTERN.test(key) || key === block.key) key = `${block.key}-copy`.slice(0, 60);
          const copy = await duplicate.mutateAsync({ id: block.id, key, name });
          router.push(`/admin/email-templates/blocks/${copy.id}`);
        }),
    });
  };

  const askArchive = () =>
    confirm({
      title: archived ? t("unarchiveDialog.title") : t("archiveDialog.title", { name: block.name }),
      description: archived ? t("unarchiveDialog.description") : t("archiveDialog.description"),
      confirmLabel: archived ? t("unarchiveDialog.confirm") : t("archiveDialog.confirm"),
      destructive: !archived,
      onConfirm: () =>
        archived ? run(t("toasts.unarchived"), () => unarchive.mutateAsync(block.id)) : run(t("toasts.archived"), () => archive.mutateAsync(block.id)),
    });

  const askDelete = () =>
    confirm({
      title: t("deleteDialog.title", { name: block.name }),
      description: t("deleteDialog.description"),
      confirmLabel: t("deleteDialog.confirm"),
      destructive: true,
      onConfirm: () =>
        run(t("toasts.deleted"), async () => {
          await remove.mutateAsync(block.id);
          router.push(isLayout ? "/admin/email-templates#layouts" : "/admin/email-templates#blocks");
        }),
    });

  const askDiscard = () =>
    confirm({
      title: t("discardDialog.title"),
      description: t("discardDialog.description", { version: block.publishedVersion }),
      confirmLabel: t("discardDialog.confirm"),
      destructive: true,
      onConfirm: () => run(t("toasts.discarded"), () => discard.mutateAsync(block.id)),
    });

  const askDefault = () =>
    confirm({
      title: t("defaultDialog.title", { name: block.name }),
      description: t("defaultDialog.description"),
      confirmLabel: t("defaultDialog.confirm"),
      onConfirm: () => run(t("toasts.defaulted"), () => setDefault.mutateAsync(block.id)),
    });

  const askRestore = (version: number) =>
    confirm({
      title: t("restoreDialog.title", { version }),
      description: t("restoreDialog.description"),
      confirmLabel: t("restoreDialog.confirm"),
      onConfirm: () => run(t("toasts.restored", { version }), () => restore.mutateAsync({ id: block.id, version })),
    });

  const set = (field: keyof BlockDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const draftFields = useMemo(
    () => ({ html: draft.html, text: draft.text || null, darkCss: draft.darkCss || null }),
    [draft.html, draft.text, draft.darkCss],
  );

  return (
    <AdminPage>
      {backLink}
      <AdminPageHeader
        eyebrow={isLayout ? t("eyebrowLayout") : t("eyebrowBlock")}
        eyebrowIcon={<Stack size={14} weight="fill" />}
        title={block.name}
        description={isLayout ? t("descriptionLayout") : t("descriptionBlock", { include: blockInclude(block.key) })}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
        {block.isDefault ? (
          <CmsChip className={CHIP_TONES.accent}>
            <Star size={10} weight="fill" />
            {t("default")}
          </CmsChip>
        ) : null}
        <CmsChip className={status === "PUBLISHED" ? CHIP_TONES.positive : status === "CHANGES" ? CHIP_TONES.warning : status === "DRAFT" ? CHIP_TONES.info : CHIP_TONES.neutral}>
          {t(`statuses.${status}`)}
        </CmsChip>
        <span className="font-mono text-[11.5px]">{isLayout ? block.key : blockInclude(block.key)}</span>
        <span aria-hidden>·</span>
        <span>{block.usedBy.length > 0 ? t("usedByCount", { count: block.usedBy.length }) : t("unused")}</span>
      </div>
      {archived ? (
        <p className="mt-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12.5px] text-ink-muted">{t("archivedNotice")}</p>
      ) : null}

      <div className="mt-5">
        <CmsTabBar<Tab>
          label={t("tabsLabel")}
          value={tab}
          onChange={setTab}
          tabs={TABS.map((value) => ({
            value,
            label: t(`tabs.${value}`),
            badge: value === "usage" ? block.usedBy.length : value === "content" && issues.length ? issues.length : undefined,
          }))}
        />

        <CmsTabPanel value="content" active={tab}>
          <fieldset disabled={archived} className="space-y-4 disabled:opacity-70">
            <AdminPanel className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="block-name" className="text-[12px] text-ink-muted">
                  {t("fields.name")}
                </Label>
                <Input id="block-name" className="mt-1.5" value={draft.name} maxLength={120} onChange={(event) => set("name", event.target.value)} />
              </div>
              <div>
                <Label htmlFor="block-description" className="text-[12px] text-ink-muted">
                  {t("fields.description")}
                </Label>
                <Input id="block-description" className="mt-1.5" value={draft.description} maxLength={500} onChange={(event) => set("description", event.target.value)} />
              </div>
            </AdminPanel>
            <AdminPanel className="space-y-4 p-4">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor="block-html" className="text-[12px] text-ink-muted">
                    {t("fields.html")}
                  </Label>
                  <span className="text-[11px] text-ink-subtle">{isLayout ? t("fields.htmlHintLayout") : t("fields.htmlHintBlock")}</span>
                </div>
                <Textarea
                  id="block-html"
                  className="mt-1.5 min-h-[360px] font-mono text-[12.5px] leading-relaxed"
                  value={draft.html}
                  onChange={(event) => set("html", event.target.value)}
                />
              </div>
              {isLayout ? (
                <>
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <Label htmlFor="block-text" className="text-[12px] text-ink-muted">
                        {t("fields.text")}
                      </Label>
                      <span className="text-[11px] text-ink-subtle">{t("fields.textHint")}</span>
                    </div>
                    <Textarea
                      id="block-text"
                      className="mt-1.5 min-h-[100px] font-mono text-[12.5px]"
                      value={draft.text}
                      onChange={(event) => set("text", event.target.value)}
                    />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <Label htmlFor="block-dark" className="text-[12px] text-ink-muted">
                        {t("fields.darkCss")}
                      </Label>
                      <span className="text-[11px] text-ink-subtle">{t("fields.darkCssHint")}</span>
                    </div>
                    <Textarea
                      id="block-dark"
                      className="mt-1.5 min-h-[120px] font-mono text-[12.5px]"
                      value={draft.darkCss}
                      placeholder=".card { background: #1b1c1f !important; }"
                      onChange={(event) => set("darkCss", event.target.value)}
                    />
                  </div>
                </>
              ) : null}
              {issues.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                  {issues.map((issue, index) => (
                    <li key={index}>
                      <span className="font-mono text-[11px]">{issue.field}</span> — {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </AdminPanel>
          </fieldset>
        </CmsTabPanel>

        <CmsTabPanel value="preview" active={tab}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <PreviewControls
              options={previewOptions}
              onChange={setPreviewOptions}
              extra={
                <>
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                    {t("previewWith")}
                    <select
                      value={previewTemplate}
                      onChange={(event) => setPreviewTemplate(event.target.value)}
                      className="h-8 max-w-[220px] rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink"
                    >
                      <option value="">{t("previewSample")}</option>
                      {(templates.data ?? []).map((template) => (
                        <option key={template.key} value={template.key}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <select
                    aria-label={t("previewLocale")}
                    value={previewLocale}
                    onChange={(event) => setPreviewLocale(event.target.value)}
                    className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink"
                  >
                    {EMAIL_LOCALES.map((code) => (
                      <option key={code} value={code}>
                        {code.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </>
              }
            />
          </div>
          {preview.isError ? <p className="mb-2 text-[12.5px] text-destructive">{getErrorMessage(preview.error, t("previewError"))}</p> : null}
          <EmailPreviewFrame preview={preview.data} options={previewOptions} title={block.name} loading={preview.isFetching} />
        </CmsTabPanel>

        <CmsTabPanel value="usage" active={tab}>
          {block.usedBy.length === 0 ? (
            <CmsEmptyState icon={<Stack size={18} />} title={t("usage.none")} description={isLayout ? t("usage.noneLayout") : t("usage.noneBlock", { include: blockInclude(block.key) })} />
          ) : (
            <AdminPanel>
              <p className="border-b border-border px-4 py-3 text-[12.5px] text-ink-muted">{t("usage.description")}</p>
              <ul className="divide-y divide-border/70">
                {block.usedBy.map((use) => (
                  <li key={use} className="px-4 py-2.5 text-[13px] text-ink">
                    {use}
                  </li>
                ))}
              </ul>
            </AdminPanel>
          )}
        </CmsTabPanel>

        <CmsTabPanel value="history" active={tab}>
          <div className="space-y-8">
            <section>
              <h3 className="mb-3 text-[13px] font-semibold">{t("history.versions")}</h3>
              <VersionHistory
                versions={versions.data}
                isLoading={versions.isPending}
                isError={versions.isError}
                draftFields={draftFields}
                fieldLabels={
                  isLayout
                    ? [
                        { key: "html", label: t("fields.html") },
                        { key: "text", label: t("fields.text") },
                        { key: "darkCss", label: t("fields.darkCss") },
                      ]
                    : [{ key: "html", label: t("fields.html") }]
                }
                onRestore={askRestore}
                restoring={restore.isPending}
              />
            </section>
            <section>
              <h3 className="mb-3 text-[13px] font-semibold">{t("history.audit")}</h3>
              <AuditHistory entityType="email_block" entityId={block.id} />
            </section>
          </div>
        </CmsTabPanel>
      </div>

      <CmsActionBar
        status={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <DirtyDot dirty={dirty} />
            <span>{block.publishedVersion > 0 ? t("status.published", { version: block.publishedVersion }) : t("status.never")}</span>
            <EditedBy at={block.draftUpdatedAt} by={block.draftUpdatedBy} />
          </span>
        }
      >
        <Button variant="outline" size="sm" onClick={handleSave} disabled={!canSave}>
          <FloppyDisk size={14} />
          {t("actions.saveDraft")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTab("preview")}>
          <Eye size={14} />
          {t("actions.preview")}
        </Button>
        <Button variant="outline" size="sm" onClick={askDuplicate} disabled={busy}>
          <Copy size={14} />
          {t("actions.duplicate")}
        </Button>
        {isLayout && !block.isDefault && block.publishedVersion > 0 && !archived ? (
          <Button variant="outline" size="sm" onClick={askDefault} disabled={busy}>
            <Star size={14} />
            {t("actions.makeDefault")}
          </Button>
        ) : null}
        {block.publishedVersion > 0 ? (
          <Button variant="outline" size="sm" onClick={askArchive} disabled={busy || (!archived && block.isDefault)}>
            <Archive size={14} />
            {archived ? t("actions.unarchive") : t("actions.archive")}
          </Button>
        ) : null}
        {block.hasDraftChanges && block.publishedVersion > 0 && !archived ? (
          <Button variant="outline" size="sm" onClick={askDiscard} disabled={busy}>
            <ArrowCounterClockwise size={14} />
            {t("actions.discard")}
          </Button>
        ) : null}
        {block.publishedVersion === 0 ? (
          <Button variant="destructive" size="sm" onClick={askDelete} disabled={busy}>
            <Trash size={14} />
            {t("actions.delete")}
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={askPublish}
          disabled={archived || busy || issues.length > 0 || (!dirty && !block.hasDraftChanges) || !draft.name.trim()}
        >
          <UploadSimple size={14} />
          {dirty ? t("actions.saveAndPublish") : t("actions.publish")}
        </Button>
      </CmsActionBar>
      {confirmDialog}
    </AdminPage>
  );
}
