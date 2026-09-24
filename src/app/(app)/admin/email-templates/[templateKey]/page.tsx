"use client";

/**
 * One email's editor: subject, heading and body on the left, the server-rendered preview on the
 * right, the variables it may use, and its history.
 *
 * Save publishes. Every sender reads the saved version on its next email (after the senders'
 * ~30-second cache), so there is no separate "publish" step to forget — and the save is refused
 * by the server when the template would send a broken email (an unknown variable, the one link
 * the email exists to deliver missing, unsafe HTML). "Send test to me" sends the UNSAVED draft,
 * filled with sample values, to the signed-in admin only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ClockCounterClockwise,
  EnvelopeSimple,
  FloppyDisk,
  PaperPlaneTilt,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { CHIP_TONES, CmsChip, EditedBy, useCmsDateFormatter } from "@/components/admin/cms/cms-shared";
import { EmailPreviewFrame } from "@/components/admin/cms/email-template-preview-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminEmailTemplate,
  useAdminEmailTemplateVersions,
  useEmailTemplatePreview,
  useResetEmailTemplate,
  useRestoreEmailTemplateVersion,
  useSaveEmailTemplate,
  useSendTestEmail,
} from "@/hooks/use-admin-email-templates";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import {
  checkTemplate,
  insertAt,
  placeholder,
  sameContent,
  type TemplateContent,
  type TemplateField,
} from "@/lib/admin/email-template-editor";
import { cn } from "@/lib/utils";
import type { EmailTemplateDetailDto, EmailTemplateVersionDto } from "@/types/admin-cms";

export default function AdminEmailTemplateEditorPage() {
  const params = useParams<{ templateKey: string }>();
  const key = decodeURIComponent(params.templateKey ?? "");
  const t = useTranslations("adminCms.emailTemplates.editor");
  const detailQuery = useAdminEmailTemplate(key);

  const backLink = (
    <Link
      href="/admin/email-templates"
      className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink"
    >
      <ArrowLeft size={12} />
      {t("back")}
    </Link>
  );

  if (detailQuery.isError) {
    const notFound = apiErrorCode(detailQuery.error) === 404;
    return (
      <AdminPage>
        {backLink}
        <AdminPanel className="flex items-start gap-3 px-4 py-10 text-sm">
          <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">{notFound ? t("notFound") : t("loadError")}</p>
            {!notFound ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void detailQuery.refetch()}>
                {t("retry")}
              </Button>
            ) : null}
          </div>
        </AdminPanel>
      </AdminPage>
    );
  }

  if (!detailQuery.data) {
    return (
      <AdminPage>
        {backLink}
        <div className="h-8 w-64 animate-pulse rounded bg-surface-2" />
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <div className="h-[520px] animate-pulse rounded-lg bg-surface-2" />
          <div className="h-[520px] animate-pulse rounded-lg bg-surface-2" />
        </div>
      </AdminPage>
    );
  }

  // Keyed on the saved version: after a save, restore or reset the editor re-seeds from the
  // server instead of keeping a draft of content that no longer exists.
  return (
    <Editor
      key={`${key}:${detailQuery.data.template.version}:${detailQuery.data.template.isCustomized}`}
      detail={detailQuery.data}
      backLink={backLink}
    />
  );
}

function Editor({ detail, backLink }: { detail: EmailTemplateDetailDto; backLink: React.ReactNode }) {
  const t = useTranslations("adminCms.emailTemplates.editor");
  const tStatus = useTranslations("adminCms.emailTemplates.status");
  const template = detail.template;

  const [draft, setDraft] = useState<TemplateContent>(detail.current);
  const [note, setNote] = useState("");
  const [view, setView] = useState<"html" | "text">("html");
  const [focused, setFocused] = useState<TemplateField>("bodyHtml");
  const [confirmReset, setConfirmReset] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const save = useSaveEmailTemplate();
  const reset = useResetEmailTemplate();
  const sendTest = useSendTestEmail();

  const dirty = !sameContent(draft, detail.current);
  const localIssues = useMemo(() => checkTemplate(template.variables, draft), [template.variables, draft]);
  const debounced = useDebouncedValue(draft, 400);
  const preview = useEmailTemplatePreview(template.key, debounced);
  // The server's list is the complete one (it also checks HTML safety). While it catches up with
  // the latest keystroke, the local check fills in.
  const issueMessages = useMemo(() => {
    if (sameContent(debounced, draft) && preview.data && !preview.isPlaceholderData)
      return preview.data.issues.map((issue) => issue.message);
    return localIssues.map((issue) =>
      issue.variable ? t(`issues.${issue.code}`, { name: issue.variable }) : t(`issues.${issue.code}`),
    );
  }, [debounced, draft, preview.data, preview.isPlaceholderData, localIssues, t]);
  const blocked = issueMessages.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (field: TemplateField, value: string) => setDraft((current) => ({ ...current, [field]: value }));

  const insertVariable = (name: string) => {
    const element =
      focused === "subject" ? subjectRef.current : focused === "heading" ? headingRef.current : bodyRef.current;
    const token = placeholder(name);
    const next = insertAt(draft[focused], element?.selectionStart ?? null, element?.selectionEnd ?? null, token);
    set(focused, next.value);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        key: template.key,
        request: { ...draft, expectedVersion: template.version, note: note.trim() || null },
      });
      toast.success(t("toasts.saved"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.saveFailed")));
    }
  };

  const handleTest = async () => {
    try {
      const result = await sendTest.mutateAsync({ key: template.key, draft });
      toast.success(t("toasts.testSent", { email: result.sentTo }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.testFailed")));
    }
  };

  const handleReset = async () => {
    try {
      await reset.mutateAsync(template.key);
      setConfirmReset(false);
      toast.success(t("toasts.reset"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.resetFailed")));
    }
  };

  return (
    <AdminPage>
      {backLink}
      <AdminPageHeader
        eyebrow={t("eyebrow", { service: template.service, provider: template.provider })}
        eyebrowIcon={<EnvelopeSimple size={14} weight="fill" />}
        title={template.name}
        description={template.trigger}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setDraft(detail.current)} disabled={!dirty}>
              {t("discard")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmReset(true)}
              disabled={!template.isCustomized || reset.isPending}
            >
              <ArrowCounterClockwise size={14} />
              {t("resetToDefault")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={blocked || sendTest.isPending}>
              <PaperPlaneTilt size={14} />
              {sendTest.isPending ? t("sending") : t("sendTest")}
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={!dirty || blocked || save.isPending}>
              <FloppyDisk size={14} />
              {save.isPending ? t("saving") : t("save")}
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
        <CmsChip className={template.isLive ? CHIP_TONES.positive : CHIP_TONES.neutral}>
          {template.isLive ? tStatus("live") : tStatus("dormant")}
        </CmsChip>
        {template.isCustomized ? (
          <CmsChip className={CHIP_TONES.accent}>{tStatus("customized", { version: template.version })}</CmsChip>
        ) : (
          <CmsChip className={CHIP_TONES.neutral}>{tStatus("default")}</CmsChip>
        )}
        {dirty ? <CmsChip className={CHIP_TONES.warning}>{t("unsaved")}</CmsChip> : null}
        {template.updatedAt ? <EditedBy at={template.updatedAt} by={template.updatedBy} /> : null}
      </div>
      {template.dormantReason ? (
        <p className="mt-2 text-[12.5px] text-amber-700 dark:text-amber-300">{template.dormantReason}</p>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <AdminPanel className="space-y-4 p-4">
            <div>
              <Label htmlFor="template-subject" className="text-[12px] text-ink-muted">
                {t("fields.subject")}
              </Label>
              <Input
                id="template-subject"
                ref={subjectRef}
                className="mt-1.5 font-mono text-[13px]"
                value={draft.subject}
                maxLength={255}
                onFocus={() => setFocused("subject")}
                onChange={(event) => set("subject", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="template-heading" className="text-[12px] text-ink-muted">
                {t("fields.heading")}
              </Label>
              <Input
                id="template-heading"
                ref={headingRef}
                className="mt-1.5 font-mono text-[13px]"
                value={draft.heading}
                maxLength={255}
                onFocus={() => setFocused("heading")}
                onChange={(event) => set("heading", event.target.value)}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="template-body" className="text-[12px] text-ink-muted">
                  {t("fields.body")}
                </Label>
                <span className="text-[11px] text-ink-subtle">{t("fields.bodyHint")}</span>
              </div>
              <Textarea
                id="template-body"
                ref={bodyRef}
                className="mt-1.5 min-h-[340px] font-mono text-[12px] leading-relaxed"
                spellCheck={false}
                value={draft.bodyHtml}
                onFocus={() => setFocused("bodyHtml")}
                onChange={(event) => set("bodyHtml", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="template-note" className="text-[12px] text-ink-muted">
                {t("fields.note")}
              </Label>
              <Input
                id="template-note"
                className="mt-1.5 text-[13px]"
                value={note}
                maxLength={500}
                placeholder={t("fields.notePlaceholder")}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </AdminPanel>

          {issueMessages.length > 0 ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12.5px] text-destructive"
            >
              <p className="font-medium">{t("issuesTitle")}</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {issueMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <AdminPanel className="p-4">
            <h2 className="text-[13px] font-semibold">{t("variables.title")}</h2>
            <p className="mt-1 text-[12px] text-ink-muted">
              {t("variables.description", { field: t(`variables.fields.${focused}`) })}
            </p>
            <ul className="mt-3 space-y-2">
              {template.variables.map((variable) => (
                <li key={variable.name} className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => insertVariable(variable.name)}
                    className="shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink hover:border-ink/30 hover:bg-surface-3"
                    title={t("variables.insert")}
                  >
                    {placeholder(variable.name)}
                  </button>
                  <span className="min-w-0 text-[12px] text-ink-muted">
                    {variable.description}
                    {variable.required ? (
                      <span className="ml-1.5 font-medium text-ink">{t("variables.required")}</span>
                    ) : null}
                    <span className="mt-0.5 block truncate text-[11px] text-ink-subtle">
                      {t("variables.sample", { value: variable.sample })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </AdminPanel>

          <VersionHistory
            templateKey={template.key}
            onLoad={(version) => {
              setDraft({ subject: version.subject, heading: version.heading, bodyHtml: version.bodyHtml });
              toast.message(t("history.loaded", { version: version.version }));
            }}
          />
        </div>

        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <FilterChipGroup label={t("previewViewAria")} className="pb-3">
            <FilterChip selected={view === "html"} onClick={() => setView("html")}>
              {t("previewHtml")}
            </FilterChip>
            <FilterChip selected={view === "text"} onClick={() => setView("text")}>
              {t("previewText")}
            </FilterChip>
          </FilterChipGroup>
          {preview.isError ? (
            <AdminPanel className="px-4 py-10 text-[13px] text-destructive">{t("previewError")}</AdminPanel>
          ) : (
            <EmailPreviewFrame
              preview={preview.data}
              view={view}
              title={t("previewTitle")}
              className={cn(preview.isFetching && "opacity-80")}
            />
          )}
          <p className="mt-2 text-[11.5px] text-ink-subtle">{t("previewNote")}</p>
        </div>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("resetDialog.title")}</DialogTitle>
            <DialogDescription>{t("resetDialog.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              {t("resetDialog.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleReset()} disabled={reset.isPending}>
              {t("resetDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}

function VersionHistory({
  templateKey,
  onLoad,
}: {
  templateKey: string;
  onLoad: (version: EmailTemplateVersionDto) => void;
}) {
  const t = useTranslations("adminCms.emailTemplates.editor.history");
  const versions = useAdminEmailTemplateVersions(templateKey);
  const restore = useRestoreEmailTemplateVersion();
  const formatDate = useCmsDateFormatter();

  const handleRestore = async (version: number) => {
    try {
      await restore.mutateAsync({ key: templateKey, version });
      toast.success(t("restored", { version }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("restoreFailed")));
    }
  };

  const items = versions.data ?? [];

  return (
    <AdminPanel>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ClockCounterClockwise size={14} className="text-ink-muted" />
        <h2 className="text-[13px] font-semibold">{t("title")}</h2>
      </div>
      {versions.isError ? (
        <p className="px-4 py-4 text-[12.5px] text-destructive">{t("error")}</p>
      ) : versions.isPending ? (
        <p className="px-4 py-4 text-[12.5px] text-ink-muted">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-ink-muted">{t("empty")}</p>
      ) : (
        <ul>
          {items.map((version, index) => (
            <li
              key={version.version}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-4 py-2.5 last:border-b-0"
            >
              <span className="w-10 shrink-0 font-mono text-[12px] text-ink">v{version.version}</span>
              <CmsChip
                className={
                  version.action === "RESET"
                    ? CHIP_TONES.warning
                    : version.action === "RESTORED"
                      ? CHIP_TONES.info
                      : CHIP_TONES.neutral
                }
              >
                {t(`actions.${version.action}` as "actions.SAVED", { from: version.restoredFromVersion ?? 0 })}
              </CmsChip>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">
                {formatDate(version.createdAt)}
                {version.note ? ` · ${version.note}` : ""}
              </span>
              <span className="flex shrink-0 gap-1">
                <Button variant="ghost" size="xs" onClick={() => onLoad(version)}>
                  {t("load")}
                </Button>
                {index > 0 ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void handleRestore(version.version)}
                    disabled={restore.isPending}
                  >
                    {t("restore")}
                  </Button>
                ) : (
                  <span className="px-2 text-[11px] text-ink-subtle">{t("current")}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
