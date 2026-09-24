"use client";

/**
 * One email, in one locale at a time.
 *
 * Each locale has a DRAFT and a PUBLISHED side. Editing and saving touches only the draft; the
 * senders keep sending the published side (or, for a locale with none, English's, then the
 * built-in wording) until Publish. The preview, the test send and the issue list are all rendered
 * by the server with the same renderer the senders use.
 *
 * Tabs: Content (subject, preheader, heading, HTML, plain text) · Layout (which layout, which
 * blocks) · Variables (what the email can say, and named sample-data sets) · Preview (desktop /
 * mobile, light / dark, HTML / text) · History (published versions with a diff and restore, and
 * the audit log) · Analytics (what was actually handed to the provider).
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  Copy,
  EnvelopeSimple,
  Eye,
  FloppyDisk,
  PaperPlaneTilt,
  Plus,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { BarList } from "@/components/admin/charts/bar-list";
import { ChartEmpty, ChartFigure, CHART_COLORS, TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
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
import { CHIP_TONES, CmsChip, EditedBy } from "@/components/admin/cms/cms-shared";
import {
  DEFAULT_PREVIEW_OPTIONS,
  EmailPreviewFrame,
  PreviewControls,
  type PreviewOptions,
} from "@/components/admin/cms/email-preview-frame";
import { SendTestEmailDialog } from "@/components/admin/cms/email-send-test-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useEmailBlocks } from "@/hooks/use-admin-email-blocks";
import {
  useAdminEmailTemplate,
  useArchiveEmail,
  useDeleteSampleSet,
  useDiscardEmailDraft,
  useDuplicateEmail,
  useEmailTemplatePreview,
  useEmailTemplateStats,
  useEmailTemplateVersions,
  usePublishEmail,
  useResetEmailToDefault,
  useRestoreEmailVersion,
  useSaveEmailDraft,
  useSaveSampleSet,
  useUnarchiveEmail,
} from "@/hooks/use-admin-email-templates";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  blockInclude,
  checkTemplate,
  insertAt,
  localeState,
  placeholder,
  sameContent,
  sentVersionFor,
  type LocaleState,
  type TemplateContent,
  type TemplateField,
} from "@/lib/admin/email-template-editor";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import {
  EMAIL_LOCALES,
  type EmailContentFieldsDto,
  type EmailPreviewRequest,
  type EmailSampleDataSetDto,
  type EmailTemplateDetailDto,
  type EmailVariantDto,
} from "@/types/admin-cms";

const TABS = ["content", "layout", "variables", "preview", "history", "analytics"] as const;
type Tab = (typeof TABS)[number];

const BUILT_IN_SET = "00000000-0000-0000-0000-000000000000";

/** Where each field lives in the DOM, for inserting a variable at its cursor. */
const FIELD_IDS: Record<TemplateField, string> = {
  subject: "email-subject",
  preheader: "email-preheader",
  heading: "email-heading",
  bodyHtml: "email-body",
  textBody: "email-text",
};

export default function EmailTemplateDetailPage() {
  const params = useParams<{ templateKey: string }>();
  const key = decodeURIComponent(params.templateKey);
  const t = useTranslations("adminCms.emailEditor");
  const detail = useAdminEmailTemplate(key);
  const [locale, setLocale] = useState<string>("en");

  const backLink = (
    <Link href="/admin/email-templates" className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink">
      <ArrowLeft size={12} />
      {t("back")}
    </Link>
  );

  if (detail.isError) {
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

  if (!detail.data) {
    return (
      <AdminPage>
        {backLink}
        <div className="h-8 w-72 animate-pulse rounded bg-surface-2" />
        <div className="mt-6 h-[560px] animate-pulse rounded-lg bg-surface-2" />
      </AdminPage>
    );
  }

  const variant = detail.data.variants.find((candidate) => candidate.locale === locale) ?? null;
  return (
    <Editor
      // Re-seeded when the server copy moves (a save, a publish, a restore) or the locale changes,
      // so the form never edits a draft that no longer exists.
      key={`${key}:${locale}:${variant?.draftUpdatedAt ?? "none"}:${variant?.publishedVersion ?? 0}:${variant?.status ?? ""}`}
      detail={detail.data}
      locale={locale}
      onLocale={setLocale}
      variant={variant}
      backLink={backLink}
    />
  );
}

function contentFrom(fields: EmailContentFieldsDto): TemplateContent {
  return {
    subject: fields.subject,
    preheader: fields.preheader ?? "",
    heading: fields.heading,
    bodyHtml: fields.bodyHtml,
    textBody: fields.textBody ?? "",
  };
}

function fieldsFrom(content: TemplateContent, layoutId: string | null): EmailContentFieldsDto {
  return {
    subject: content.subject,
    preheader: content.preheader,
    heading: content.heading,
    bodyHtml: content.bodyHtml,
    textBody: content.textBody.trim() ? content.textBody : null,
    layoutId,
  };
}

const LOCALE_TONE: Record<LocaleState, string> = {
  PUBLISHED: "bg-emerald-500",
  CHANGES: "bg-amber-500",
  DRAFT_ONLY: "bg-sky-500",
  ARCHIVED: "bg-ink-subtle/50",
  MISSING: "border border-border",
};

function Editor({
  detail,
  locale,
  onLocale,
  variant,
  backLink,
}: {
  detail: EmailTemplateDetailDto;
  locale: string;
  onLocale: (locale: string) => void;
  variant: EmailVariantDto | null;
  backLink: React.ReactNode;
}) {
  const t = useTranslations("adminCms.emailEditor");
  const tCommon = useTranslations("adminCms.common");
  const { template } = detail;
  const [tab, setTab] = useHashTab(TABS, "content");

  const initial = useMemo(() => contentFrom(variant?.draft ?? detail.default), [variant, detail.default]);
  const initialLayout = variant?.draft.layoutId ?? null;
  const [content, setContent] = useState<TemplateContent>(initial);
  const [layoutId, setLayoutId] = useState<string | null>(initialLayout);
  const [deriveText, setDeriveText] = useState(!initial.textBody.trim());
  const [sampleSetId, setSampleSetId] = useState<string>(BUILT_IN_SET);
  const [previewOptions, setPreviewOptions] = useState<PreviewOptions>(DEFAULT_PREVIEW_OPTIONS);
  const [testing, setTesting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const noteRef = useRef("");
  const targetRef = useRef("vi");

  const save = useSaveEmailDraft();
  const publish = usePublishEmail();
  const discard = useDiscardEmailDraft();
  const archive = useArchiveEmail();
  const unarchive = useUnarchiveEmail();
  const duplicate = useDuplicateEmail();
  const reset = useResetEmailToDefault();
  const restore = useRestoreEmailVersion();
  const busy =
    save.isPending || publish.isPending || discard.isPending || archive.isPending || unarchive.isPending || duplicate.isPending || reset.isPending || restore.isPending;

  const effective: TemplateContent = { ...content, textBody: deriveText ? "" : content.textBody };
  // Unsaved: what is on screen differs from the saved draft (or, for a locale never written, from
  // the built-in wording it starts from).
  const savedDirty = !sameContent(effective, initial) || layoutId !== initialLayout;
  const archived = variant?.status === "ARCHIVED";
  const localIssues = checkTemplate(template.variables, effective);
  const state = localeState(variant ?? undefined);
  const sentAs = sentVersionFor(locale, detail.variants);

  useUnsavedGuard(savedDirty);

  // ── Preview (server-rendered, debounced) ──
  // Memoised before debouncing: a fresh object every render would restart the timer forever.
  const previewRequest = useMemo<EmailPreviewRequest>(
    () => ({
      locale,
      subject: content.subject,
      preheader: content.preheader,
      heading: content.heading,
      bodyHtml: content.bodyHtml,
      textBody: !deriveText && content.textBody.trim() ? content.textBody : null,
      layoutId,
      sampleSetId: sampleSetId === BUILT_IN_SET ? null : sampleSetId,
      values: null,
      dark: previewOptions.dark,
    }),
    [locale, content, deriveText, layoutId, sampleSetId, previewOptions.dark],
  );
  const debounced = useDebouncedValue(previewRequest, 350);
  const preview = useEmailTemplatePreview(template.key, debounced);
  const serverIssues = preview.data?.issues ?? [];

  // ── Field insertion (variables and blocks go into whichever field was focused last) ──
  // The element is looked up by id when inserting (an event handler), never read during render.
  const [lastField, setLastField] = useState<TemplateField>("bodyHtml");
  const insert = (token: string, into: TemplateField = lastField) => {
    const field = into;
    const element = document.getElementById(FIELD_IDS[field]) as HTMLInputElement | HTMLTextAreaElement | null;
    const current = content[field];
    const next = insertAt(current, element?.selectionStart ?? null, element?.selectionEnd ?? null, token);
    setContent((value) => ({ ...value, [field]: next.value }));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(next.caret, next.caret);
    });
  };
  const bind = (field: TemplateField) => ({ onFocus: () => setLastField(field) });

  const run = async (success: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast.success(success);
    } catch (caught) {
      toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
    }
  };

  const persist = async () => {
    await save.mutateAsync({
      key: template.key,
      locale,
      request: {
        subject: effective.subject,
        preheader: effective.preheader,
        heading: effective.heading,
        bodyHtml: effective.bodyHtml,
        textBody: effective.textBody.trim() ? effective.textBody : null,
        layoutId,
        expectedDraftUpdatedAt: variant?.draftUpdatedAt ?? null,
      },
    });
  };

  const canSave = savedDirty && !archived && !busy;
  const handleSave = () => {
    if (!canSave) return;
    void run(t("toasts.saved"), persist);
  };
  useSaveShortcut(handleSave, canSave);

  const blockingIssues = localIssues.length > 0 || serverIssues.length > 0;
  const askPublish = () => {
    noteRef.current = "";
    confirm({
      title: t("publishDialog.title", { locale: locale.toUpperCase() }),
      description: t("publishDialog.description", { name: template.name }),
      confirmLabel: t("publishDialog.confirm"),
      body: (
        <div>
          <Label htmlFor="publish-note" className="text-[12px] text-ink-muted">
            {t("publishDialog.note")}
          </Label>
          <Input id="publish-note" className="mt-1.5" maxLength={500} placeholder={t("publishDialog.notePlaceholder")} onChange={(event) => (noteRef.current = event.target.value)} />
        </div>
      ),
      onConfirm: () =>
        run(t("toasts.published", { locale: locale.toUpperCase() }), async () => {
          if (savedDirty) await persist();
          await publish.mutateAsync({
            key: template.key,
            locale,
            request: { note: noteRef.current.trim() || null, expectedPublishedVersion: variant?.publishedVersion ?? 0 },
          });
        }),
    });
  };

  const askDuplicate = () => {
    targetRef.current = EMAIL_LOCALES.find((code) => code !== locale) ?? "vi";
    confirm({
      title: t("duplicateDialog.title"),
      description: t("duplicateDialog.description", { locale: locale.toUpperCase() }),
      confirmLabel: t("duplicateDialog.confirm"),
      body: (
        <label className="block text-[12px] text-ink-muted">
          {t("duplicateDialog.target")}
          <select
            defaultValue={targetRef.current}
            onChange={(event) => (targetRef.current = event.target.value)}
            className="mt-1.5 block h-8 w-full rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink"
          >
            {EMAIL_LOCALES.filter((code) => code !== locale).map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
                {detail.variants.some((existing) => existing.locale === code) ? ` — ${t("duplicateDialog.overwrites")}` : ""}
              </option>
            ))}
          </select>
        </label>
      ),
      onConfirm: () =>
        run(t("toasts.duplicated"), async () => {
          if (savedDirty) await persist();
          const target = targetRef.current;
          await duplicate.mutateAsync({
            key: template.key,
            locale,
            targetLocale: target,
            overwrite: detail.variants.some((existing) => existing.locale === target),
          });
          onLocale(target);
        }),
    });
  };

  const askDiscard = () =>
    confirm({
      title: t("discardDialog.title"),
      description: variant?.publishedVersion ? t("discardDialog.description") : t("discardDialog.descriptionNeverPublished"),
      confirmLabel: t("discardDialog.confirm"),
      destructive: true,
      onConfirm: () => run(t("toasts.discarded"), () => discard.mutateAsync({ key: template.key, locale })),
    });

  const askArchive = () =>
    confirm({
      title: archived ? t("unarchiveDialog.title") : t("archiveDialog.title", { locale: locale.toUpperCase() }),
      description: archived ? t("unarchiveDialog.description") : t("archiveDialog.description"),
      confirmLabel: archived ? t("unarchiveDialog.confirm") : t("archiveDialog.confirm"),
      destructive: !archived,
      onConfirm: () =>
        archived
          ? run(t("toasts.unarchived"), () => unarchive.mutateAsync({ key: template.key, locale }))
          : run(t("toasts.archived"), () => archive.mutateAsync({ key: template.key, locale })),
    });

  const askReset = () =>
    confirm({
      title: t("resetDialog.title"),
      description: t("resetDialog.description"),
      confirmLabel: t("resetDialog.confirm"),
      destructive: true,
      onConfirm: () => run(t("toasts.reset"), () => reset.mutateAsync({ key: template.key, locale })),
    });

  const askRestore = (version: number) =>
    confirm({
      title: t("restoreDialog.title", { version }),
      description: t("restoreDialog.description"),
      confirmLabel: t("restoreDialog.confirm"),
      onConfirm: () => run(t("toasts.restored", { version }), () => restore.mutateAsync({ key: template.key, locale, version })),
    });

  const set = (field: TemplateField, value: string) => setContent((current) => ({ ...current, [field]: value }));
  const issueFor = (field: TemplateField) => [
    ...localIssues.filter((issue) => issue.field === field).map((issue) => t(`issues.${issue.code}`, { variable: issue.variable ?? "" })),
    ...serverIssues.filter((issue) => issue.field === field && !localIssues.some((local) => local.field === field)).map((issue) => issue.message),
  ];

  return (
    <AdminPage>
      {backLink}
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<EnvelopeSimple size={14} weight="fill" />}
        title={template.name}
        description={template.description}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
        <CmsChip className={template.isLive ? CHIP_TONES.positive : CHIP_TONES.neutral}>
          {template.isLive ? t("live") : t("dormant")}
        </CmsChip>
        <span className="font-mono text-[11.5px]">{template.key}</span>
        <span aria-hidden>·</span>
        <span>
          {template.service} · {template.provider}
        </span>
        <span aria-hidden>·</span>
        <span>{template.trigger}</span>
      </div>

      {/* Locale switcher: each locale's state, and what a recipient in it is actually sent. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink-muted">{t("locale")}</span>
        <div role="radiogroup" aria-label={t("locale")} className="flex flex-wrap gap-1.5">
          {EMAIL_LOCALES.map((code) => {
            const codeState = localeState(detail.variants.find((candidate) => candidate.locale === code));
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={locale === code}
                onClick={() => {
                  if (savedDirty && code !== locale && !window.confirm(t("switchLocaleUnsaved"))) return;
                  onLocale(code);
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
                  locale === code ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2",
                )}
              >
                <span className={cn("size-1.5 rounded-full", LOCALE_TONE[codeState])} aria-hidden />
                <span className="font-medium uppercase">{code}</span>
                <span className={cn("text-[11px]", locale === code ? "text-surface-1/70" : "text-ink-subtle")}>{t(`localeStates.${codeState}`)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[12px] text-ink-subtle">
        {sentAs === locale
          ? t("sentAs.own", { locale: locale.toUpperCase(), version: variant?.publishedVersion ?? 0 })
          : sentAs === "en"
            ? t("sentAs.english", { locale: locale.toUpperCase() })
            : t("sentAs.builtIn", { locale: locale.toUpperCase() })}
      </p>

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
            badge: value === "content" && localIssues.length + serverIssues.length > 0 ? localIssues.length + serverIssues.length : undefined,
          }))}
        />

        <CmsTabPanel value="content" active={tab}>
          <fieldset disabled={archived} className="grid gap-5 disabled:opacity-70 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <AdminPanel className="space-y-4 p-4">
                <Field id="email-subject" label={t("fields.subject")} hint={t("fields.subjectHint")} issues={issueFor("subject")}>
                  <Input id="email-subject" value={content.subject} maxLength={200} onChange={(event) => set("subject", event.target.value)} {...bind("subject")} />
                </Field>
                <Field id="email-preheader" label={t("fields.preheader")} hint={t("fields.preheaderHint")} issues={issueFor("preheader")}>
                  <Input id="email-preheader" value={content.preheader} maxLength={200} onChange={(event) => set("preheader", event.target.value)} {...bind("preheader")} />
                </Field>
                <Field id="email-heading" label={t("fields.heading")} hint={t("fields.headingHint")} issues={issueFor("heading")}>
                  <Input id="email-heading" value={content.heading} maxLength={200} onChange={(event) => set("heading", event.target.value)} {...bind("heading")} />
                </Field>
                <Field id="email-body" label={t("fields.bodyHtml")} hint={t("fields.bodyHtmlHint")} issues={issueFor("bodyHtml")}>
                  <Textarea
                    id="email-body"
                    className="min-h-[320px] font-mono text-[12.5px] leading-relaxed"
                    value={content.bodyHtml}
                    onChange={(event) => set("bodyHtml", event.target.value)}
                    {...bind("bodyHtml")}
                  />
                </Field>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="email-text" className="text-[12px] text-ink-muted">
                      {t("fields.textBody")}
                    </Label>
                    <label className="flex items-center gap-2 text-[12px] text-ink-muted">
                      <Switch checked={deriveText} onCheckedChange={(checked) => setDeriveText(Boolean(checked))} />
                      {t("fields.deriveText")}
                    </label>
                  </div>
                  {deriveText ? (
                    <p className="mt-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-ink-subtle">{t("fields.derivedHint")}</p>
                  ) : (
                    <>
                      <Textarea
                        id="email-text"
                        className="mt-1.5 min-h-[160px] font-mono text-[12.5px] leading-relaxed"
                        value={content.textBody}
                        onChange={(event) => set("textBody", event.target.value)}
                        {...bind("textBody")}
                      />
                      <IssueList issues={issueFor("textBody")} />
                    </>
                  )}
                </div>
              </AdminPanel>
            </div>

            <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
              <InsertPanel
                variables={template.variables.map((variable) => ({ name: variable.name, required: variable.required, description: variable.description }))}
                onInsert={insert}
              />
              {serverIssues.length > 0 || localIssues.length > 0 ? (
                <AdminPanel className="p-4">
                  <h3 className="text-[12.5px] font-semibold text-destructive">{t("issuesTitle")}</h3>
                  <ul className="mt-2 space-y-1.5 text-[12px] text-ink-muted">
                    {localIssues.map((issue, index) => (
                      <li key={`l${index}`}>
                        <span className="font-mono text-[11px]">{issue.field}</span> — {t(`issues.${issue.code}`, { variable: issue.variable ?? "" })}
                      </li>
                    ))}
                    {serverIssues.map((issue, index) => (
                      <li key={`s${index}`}>
                        <span className="font-mono text-[11px]">{issue.field}</span> — {issue.message}
                      </li>
                    ))}
                  </ul>
                </AdminPanel>
              ) : null}
            </aside>
          </fieldset>
        </CmsTabPanel>

        <CmsTabPanel value="layout" active={tab}>
          <LayoutTab
            layoutId={layoutId}
            onLayout={setLayoutId}
            disabled={archived}
            onInsertBlock={(key) => {
              insert(blockInclude(key), "bodyHtml");
              setTab("content");
            }}
          />
        </CmsTabPanel>

        <CmsTabPanel value="variables" active={tab}>
          <VariablesTab detail={detail} sampleSetId={sampleSetId} onSampleSet={setSampleSetId} />
        </CmsTabPanel>

        <CmsTabPanel value="preview" active={tab}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <PreviewControls
              options={previewOptions}
              onChange={setPreviewOptions}
              extra={
                <SampleSetSelect sets={detail.sampleSets} value={sampleSetId} onChange={setSampleSetId} />
              }
            />
            <span className="text-[12px] text-ink-subtle">{savedDirty ? t("previewOfDraftUnsaved") : t("previewOfDraft")}</span>
          </div>
          {preview.isError ? (
            <p className="text-[12.5px] text-destructive">{getErrorMessage(preview.error, t("previewError"))}</p>
          ) : null}
          <EmailPreviewFrame preview={preview.data} options={previewOptions} title={template.name} loading={preview.isFetching} />
        </CmsTabPanel>

        <CmsTabPanel value="history" active={tab}>
          <HistoryTab templateKey={template.key} locale={locale} draft={fieldsFrom(effective, layoutId)} onRestore={askRestore} restoring={restore.isPending} />
        </CmsTabPanel>

        <CmsTabPanel value="analytics" active={tab}>
          <AnalyticsTab templateKey={template.key} />
        </CmsTabPanel>
      </div>

      <CmsActionBar
        status={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <DirtyDot dirty={savedDirty} />
            <span>
              {state === "PUBLISHED" || state === "CHANGES"
                ? t("status.published", { version: variant?.publishedVersion ?? 0 })
                : t(`status.${state}`)}
            </span>
            {variant ? <EditedBy at={variant.draftUpdatedAt} by={variant.draftUpdatedBy} /> : null}
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
        <Button variant="outline" size="sm" onClick={() => setTesting(true)} disabled={busy}>
          <PaperPlaneTilt size={14} />
          {t("actions.sendTest")}
        </Button>
        <Button variant="outline" size="sm" onClick={askDuplicate} disabled={busy}>
          <Copy size={14} />
          {t("actions.duplicate")}
        </Button>
        {variant ? (
          <Button variant="outline" size="sm" onClick={askArchive} disabled={busy}>
            <Archive size={14} />
            {archived ? t("actions.unarchive") : t("actions.archive")}
          </Button>
        ) : null}
        {variant && !archived ? (
          <Button variant="outline" size="sm" onClick={askReset} disabled={busy}>
            <ArrowCounterClockwise size={14} />
            {t("actions.reset")}
          </Button>
        ) : null}
        {variant?.hasDraftChanges && !archived ? (
          <Button variant="destructive" size="sm" onClick={askDiscard} disabled={busy}>
            <Trash size={14} />
            {variant.publishedVersion > 0 ? t("actions.discard") : t("actions.deleteDraft")}
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={askPublish}
          disabled={archived || busy || blockingIssues || (!savedDirty && !variant?.hasDraftChanges)}
          title={blockingIssues ? t("publishBlocked") : undefined}
        >
          <UploadSimple size={14} />
          {savedDirty ? t("actions.saveAndPublish") : t("actions.publish")}
        </Button>
      </CmsActionBar>

      {testing ? (
        <SendTestEmailDialog
          open
          onOpenChange={setTesting}
          templateKey={template.key}
          templateName={template.name}
          locale={locale}
          content={fieldsFrom(effective, layoutId)}
          sampleSetId={sampleSetId === BUILT_IN_SET ? null : sampleSetId}
        />
      ) : null}
      {confirmDialog}
    </AdminPage>
  );
}

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-destructive">
      {issues.map((issue, index) => (
        <li key={index}>{issue}</li>
      ))}
    </ul>
  );
}

function Field({
  id,
  label,
  hint,
  issues,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  issues: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-[12px] text-ink-muted">
          {label}
        </Label>
        {hint ? <span className="truncate text-[11px] text-ink-subtle">{hint}</span> : null}
      </div>
      <div className="mt-1.5">{children}</div>
      <IssueList issues={issues} />
    </div>
  );
}

function InsertPanel({
  variables,
  onInsert,
}: {
  variables: { name: string; required: boolean; description: string }[];
  onInsert: (token: string) => void;
}) {
  const t = useTranslations("adminCms.emailEditor.insert");
  const blocks = useEmailBlocks("PARTIAL");
  const published = (blocks.data ?? []).filter((block) => block.status === "ACTIVE" && block.publishedVersion > 0);
  return (
    <AdminPanel className="p-4">
      <h3 className="text-[12.5px] font-semibold">{t("variables")}</h3>
      <p className="mt-0.5 text-[11.5px] text-ink-subtle">{t("variablesHint")}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <li key={variable.name}>
            <button
              type="button"
              title={variable.description}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onInsert(placeholder(variable.name))}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[11.5px] text-ink hover:border-ink/30"
            >
              {placeholder(variable.name)}
              {variable.required ? <span className="ml-1 text-destructive">*</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-[12.5px] font-semibold">{t("blocks")}</h3>
      {published.length === 0 ? (
        <p className="mt-0.5 text-[11.5px] text-ink-subtle">
          {t("noBlocks")}{" "}
          <Link href="/admin/email-templates#blocks" className="underline">
            {t("manageBlocks")}
          </Link>
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {published.map((block) => (
            <li key={block.id}>
              <button
                type="button"
                title={block.description ?? block.name}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsert(blockInclude(block.key))}
                className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[11.5px] text-ink hover:border-ink/30"
              >
                {blockInclude(block.key)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

function LayoutTab({
  layoutId,
  onLayout,
  onInsertBlock,
  disabled,
}: {
  layoutId: string | null;
  onLayout: (id: string | null) => void;
  onInsertBlock: (key: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations("adminCms.emailEditor.layout");
  const layouts = useEmailBlocks("LAYOUT");
  const partials = useEmailBlocks("PARTIAL");
  const usable = (layouts.data ?? []).filter((layout) => layout.status === "ACTIVE" && layout.publishedVersion > 0);
  const defaultLayout = usable.find((layout) => layout.isDefault);
  const options = [
    { id: null as string | null, name: t("defaultOption", { name: defaultLayout?.name ?? t("builtIn") }), description: t("defaultOptionHint") },
    ...usable.map((layout) => ({ id: layout.id as string | null, name: layout.name, description: layout.description ?? layout.key })),
  ];
  const chosenMissing = layoutId && !usable.some((layout) => layout.id === layoutId);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <AdminPanel className="p-4">
        <h3 className="text-[13px] font-semibold">{t("title")}</h3>
        <p className="mt-0.5 text-[12px] text-ink-muted">{t("description")}</p>
        {chosenMissing ? <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-300">{t("chosenUnavailable")}</p> : null}
        <div role="radiogroup" aria-label={t("title")} className="mt-3 space-y-2">
          {options.map((option) => (
            <button
              key={option.id ?? "default"}
              type="button"
              role="radio"
              aria-checked={layoutId === option.id}
              disabled={disabled}
              onClick={() => onLayout(option.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                layoutId === option.id ? "border-ink bg-surface-2" : "border-border hover:bg-surface-2",
              )}
            >
              <span className={cn("mt-1 size-3 shrink-0 rounded-full border", layoutId === option.id ? "border-4 border-ink" : "border-border")} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">{option.name}</span>
                <span className="block truncate text-[11.5px] text-ink-subtle">{option.description}</span>
              </span>
            </button>
          ))}
        </div>
        <Link href="/admin/email-templates#layouts" className="mt-3 inline-flex items-center gap-1 text-[12px] text-ink-muted underline hover:text-ink">
          {t("manage")}
        </Link>
      </AdminPanel>
      <AdminPanel className="p-4">
        <h3 className="text-[13px] font-semibold">{t("blocksTitle")}</h3>
        <p className="mt-0.5 text-[12px] text-ink-muted">{t("blocksDescription")}</p>
        <ul className="mt-3 divide-y divide-border/70">
          {(partials.data ?? [])
            .filter((block) => block.status === "ACTIVE" && block.publishedVersion > 0)
            .map((block) => (
              <li key={block.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-[13px] text-ink">{block.name}</span>
                  <span className="block font-mono text-[11px] text-ink-subtle">{blockInclude(block.key)}</span>
                </span>
                <Button variant="outline" size="sm" disabled={disabled} onClick={() => onInsertBlock(block.key)}>
                  <Plus size={12} />
                  {t("insert")}
                </Button>
              </li>
            ))}
        </ul>
        {partials.data && partials.data.filter((block) => block.status === "ACTIVE" && block.publishedVersion > 0).length === 0 ? (
          <p className="mt-2 text-[12px] text-ink-subtle">{t("noBlocks")}</p>
        ) : null}
      </AdminPanel>
    </div>
  );
}

function SampleSetSelect({
  sets,
  value,
  onChange,
}: {
  sets: EmailSampleDataSetDto[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("adminCms.emailEditor.samples");
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
      {t("label")}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink"
      >
        {sets.map((set) => (
          <option key={set.id} value={set.id}>
            {set.builtIn ? t("builtIn") : set.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function VariablesTab({
  detail,
  sampleSetId,
  onSampleSet,
}: {
  detail: EmailTemplateDetailDto;
  sampleSetId: string;
  onSampleSet: (id: string) => void;
}) {
  const t = useTranslations("adminCms.emailEditor.samples");
  const tVars = useTranslations("adminCms.emailEditor.variables");
  const tCommon = useTranslations("adminCms.common");
  const saveSet = useSaveSampleSet();
  const deleteSet = useDeleteSampleSet();
  const [confirm, confirmDialog] = useConfirm();
  const { template } = detail;
  const current = detail.sampleSets.find((set) => set.id === sampleSetId) ?? detail.sampleSets[0];
  const builtIn = !current || current.builtIn;
  const [name, setName] = useState(builtIn ? "" : current.name);
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(template.variables.map((variable) => [variable.name, current?.values[variable.name] ?? variable.sample])),
  );
  // Reseed when another set is picked.
  const [seededFor, setSeededFor] = useState(current?.id);
  if (current?.id !== seededFor) {
    setSeededFor(current?.id);
    setName(current && !current.builtIn ? current.name : "");
    setValues(Object.fromEntries(template.variables.map((variable) => [variable.name, current?.values[variable.name] ?? variable.sample])));
  }

  const submit = async (asNew: boolean) => {
    try {
      const saved = await saveSet.mutateAsync({
        key: template.key,
        id: asNew || builtIn ? null : current.id,
        request: { name: name.trim(), values },
      });
      onSampleSet(saved.id);
      toast.success(t("saved"));
    } catch (caught) {
      toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminPanel>
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-[13px] font-semibold">{tVars("title")}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">{tVars("description")}</p>
        </div>
        <table className="w-full text-left text-[12.5px]">
          <thead className="text-[11px] text-ink-muted">
            <tr className="border-b border-border">
              <th className="px-4 py-2 font-medium">{tVars("name")}</th>
              <th className="px-4 py-2 font-medium">{tVars("meaning")}</th>
              <th className="px-4 py-2 font-medium">{tVars("required")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {template.variables.map((variable) => (
              <tr key={variable.name}>
                <td className="px-4 py-2 font-mono text-[11.5px]">{placeholder(variable.name)}</td>
                <td className="px-4 py-2 text-ink-muted">{variable.description}</td>
                <td className="px-4 py-2">{variable.required ? <CmsChip className={CHIP_TONES.warning}>{tVars("requiredYes")}</CmsChip> : <span className="text-ink-subtle">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminPanel>

      <AdminPanel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-semibold">{t("title")}</h3>
            <p className="mt-0.5 text-[12px] text-ink-muted">{t("description")}</p>
          </div>
          <SampleSetSelect sets={detail.sampleSets} value={current?.id ?? BUILT_IN_SET} onChange={onSampleSet} />
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="sample-name" className="text-[12px] text-ink-muted">
              {t("name")}
            </Label>
            <Input id="sample-name" className="mt-1.5" value={name} maxLength={80} placeholder={t("namePlaceholder")} onChange={(event) => setName(event.target.value)} />
          </div>
          {template.variables.map((variable) => (
            <div key={variable.name}>
              <Label htmlFor={`sample-${variable.name}`} className="font-mono text-[11.5px] text-ink-muted">
                {variable.name}
              </Label>
              {variable.multiline ? (
                <Textarea
                  id={`sample-${variable.name}`}
                  className="mt-1 min-h-[72px] text-[12.5px]"
                  value={values[variable.name] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))}
                />
              ) : (
                <Input
                  id={`sample-${variable.name}`}
                  className="mt-1 text-[12.5px]"
                  value={values[variable.name] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!builtIn ? (
            <Button size="sm" disabled={!name.trim() || saveSet.isPending} onClick={() => void submit(false)}>
              <FloppyDisk size={14} />
              {t("save")}
            </Button>
          ) : null}
          <Button variant={builtIn ? "default" : "outline"} size="sm" disabled={!name.trim() || saveSet.isPending} onClick={() => void submit(true)}>
            <Plus size={14} />
            {t("saveAsNew")}
          </Button>
          {!builtIn ? (
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto"
              disabled={deleteSet.isPending}
              onClick={() =>
                confirm({
                  title: t("deleteTitle", { name: current.name }),
                  description: t("deleteDescription"),
                  confirmLabel: t("delete"),
                  destructive: true,
                  onConfirm: async () => {
                    try {
                      await deleteSet.mutateAsync({ key: template.key, id: current.id });
                      onSampleSet(BUILT_IN_SET);
                      toast.success(t("deleted"));
                    } catch (caught) {
                      toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
                    }
                  },
                })
              }
            >
              <Trash size={14} />
              {t("delete")}
            </Button>
          ) : null}
        </div>
      </AdminPanel>
      {confirmDialog}
    </div>
  );
}

function HistoryTab({
  templateKey,
  locale,
  draft,
  onRestore,
  restoring,
}: {
  templateKey: string;
  locale: string;
  draft: EmailContentFieldsDto;
  onRestore: (version: number) => void;
  restoring: boolean;
}) {
  const t = useTranslations("adminCms.emailEditor");
  const versions = useEmailTemplateVersions(templateKey, locale);
  const draftFields = useMemo(
    () => ({
      subject: draft.subject,
      preheader: draft.preheader,
      heading: draft.heading,
      bodyHtml: draft.bodyHtml,
      textBody: draft.textBody,
      layoutId: draft.layoutId,
    }),
    [draft],
  );
  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-[13px] font-semibold">{t("history.versions", { locale: locale.toUpperCase() })}</h3>
        <VersionHistory
          versions={versions.data}
          isLoading={versions.isPending}
          isError={versions.isError}
          draftFields={draftFields}
          fieldLabels={[
            { key: "subject", label: t("fields.subject") },
            { key: "preheader", label: t("fields.preheader") },
            { key: "heading", label: t("fields.heading") },
            { key: "bodyHtml", label: t("fields.bodyHtml") },
            { key: "textBody", label: t("fields.textBody") },
          ]}
          onRestore={onRestore}
          restoring={restoring}
        />
      </section>
      <section>
        <h3 className="mb-3 text-[13px] font-semibold">{t("history.audit")}</h3>
        <AuditHistory entityType="EmailTemplate" entityId={templateKey} />
      </section>
    </div>
  );
}

function AnalyticsTab({ templateKey }: { templateKey: string }) {
  const t = useTranslations("adminCms.emailEditor.analytics");
  const [days, setDays] = useState(30);
  const stats = useEmailTemplateStats(templateKey, days);
  const format = (value: number) => value.toLocaleString();
  const data = stats.data;
  const failureRate = data && data.totals.sent + data.totals.failed > 0 ? data.totals.failed / (data.totals.sent + data.totals.failed) : null;

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
      {stats.isError ? <p className="text-[12.5px] text-destructive">{t("error")}</p> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AdminPanel className="p-4">
          <ChartFigure
            value={data ? format(data.totals.sent) : "—"}
            caption={data ? t("figureCaption", { failed: format(data.totals.failed), rate: failureRate === null ? "—" : `${(failureRate * 100).toFixed(1)}%` }) : null}
          />
          {data && data.daily.length > 0 ? (
            <TimeSeriesChart
              labels={data.daily.map((point) => point.day.slice(5))}
              titles={data.daily.map((point) => point.day)}
              series={[
                { key: "sent", label: t("sent"), values: data.daily.map((point) => point.sent), color: CHART_COLORS.primary },
                { key: "failed", label: t("failed"), values: data.daily.map((point) => point.failed), color: CHART_COLORS.secondary },
              ]}
              variant="bar"
              integer
              formatValue={format}
              ariaLabel={t("chartLabel")}
            />
          ) : (
            <ChartEmpty height={200}>{stats.isPending ? t("loading") : t("empty")}</ChartEmpty>
          )}
        </AdminPanel>
        <AdminPanel className="p-4">
          <h3 className="mb-3 text-[12.5px] font-semibold">{t("byLocale")}</h3>
          {data && data.byLocale.length > 0 ? (
            <BarList
              ariaLabel={t("byLocale")}
              formatValue={format}
              rows={data.byLocale.map((row) => ({
                key: row.locale,
                label: row.locale.toUpperCase(),
                segments: [
                  { key: "sent", label: t("sent"), value: row.sent, color: CHART_COLORS.primary },
                  { key: "failed", label: t("failed"), value: row.failed, color: CHART_COLORS.secondary },
                ],
              }))}
            />
          ) : (
            <p className="text-[12px] text-ink-subtle">{stats.isPending ? t("loading") : t("empty")}</p>
          )}
        </AdminPanel>
      </div>
    </div>
  );
}
