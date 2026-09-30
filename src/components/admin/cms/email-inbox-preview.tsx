"use client";

/**
 * "What the recipient sees": an email opened in an inbox.
 *
 * The envelope (sender, recipient, date, subject, preheader) above the body the server rendered —
 * the same renderer that sends mail — at its true width. Toggles for desktop / mobile, light /
 * dark, language and sample data; a Plain text tab; and Edit, Send test and Open in new tab.
 * No template code anywhere: this is the view for people who judge an email by looking at it.
 *
 * `EmailInboxPreviewPanel` is presentational (the dev preview renders it from fixtures);
 * `EmailInboxPreviewDialog` fetches and wires it up.
 */

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowSquareOut,
  DeviceMobile,
  Desktop,
  Moon,
  PaperPlaneTilt,
  PencilSimple,
  Sun,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { SendTestEmailDialog } from "@/components/admin/cms/email-send-test-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useRenderedBlock } from "@/hooks/use-admin-email-blocks";
import { useAdminEmailTemplate, useAdminEmailTemplates, useRenderedEmail } from "@/hooks/use-admin-email-templates";
import { standalonePreviewDocument } from "@/lib/admin/email-library";
import { cn } from "@/lib/utils";
import { EMAIL_LOCALES, type EmailRenderedDto, type EmailSampleDataSetDto } from "@/types/admin-cms";

export type InboxDevice = "desktop" | "mobile";
export type InboxFormat = "html" | "text";

export interface InboxPreviewState {
  device: InboxDevice;
  dark: boolean;
  format: InboxFormat;
  locale: string;
  sampleSetId: string | null;
}

export const DEFAULT_INBOX_STATE: InboxPreviewState = { device: "desktop", dark: false, format: "html", locale: "en", sampleSetId: null };

function Segmented<T extends string | boolean>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center rounded-lg border border-border p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-muted transition-colors hover:text-ink",
            value === option.value && "bg-surface-2 font-medium text-ink",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Which version the preview shows, in words. */
export function SourceNote({ rendered, locale }: { rendered: EmailRenderedDto; locale: string }) {
  const t = useTranslations("adminCms.library.inbox.source");
  if (!["PUBLISHED", "DRAFT", "BUILT_IN"].includes(rendered.sourceUsed)) return null;
  const text =
    rendered.sourceUsed === "PUBLISHED"
      ? rendered.localeUsed === locale
        ? t("published", { version: rendered.version })
        : t("fallback", { locale: locale.toUpperCase(), used: rendered.localeUsed.toUpperCase() })
      : rendered.sourceUsed === "DRAFT"
        ? t("draft")
        : t("builtIn");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        rendered.sourceUsed === "DRAFT"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : "border-border bg-surface-2 text-ink-muted",
      )}
    >
      {text}
    </span>
  );
}

export function EmailInboxPreviewPanel({
  title,
  rendered,
  loading,
  error,
  state,
  onState,
  sampleSets,
  actions,
}: {
  title: string;
  rendered: EmailRenderedDto | undefined;
  loading: boolean;
  error: boolean;
  state: InboxPreviewState;
  onState: (state: InboxPreviewState) => void;
  sampleSets: readonly EmailSampleDataSetDto[];
  actions?: ReactNode;
}) {
  const t = useTranslations("adminCms.library.inbox");
  const tPreview = useTranslations("adminCms.common.preview");
  const uiLocale = useLocale();
  const mobile = state.device === "mobile";
  const now = useMemo(
    () => new Intl.DateTimeFormat(uiLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
    [uiLocale],
  );
  const set = (patch: Partial<InboxPreviewState>) => onState({ ...state, ...patch });
  const initial = (rendered?.fromName || "W").trim().charAt(0).toUpperCase();

  return (
    <div className="flex min-h-0 flex-col">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 pr-12">
        <Segmented
          label={tPreview("device")}
          value={state.device}
          onChange={(device) => set({ device })}
          options={[
            { value: "desktop", label: tPreview("desktop"), icon: <Desktop size={14} /> },
            { value: "mobile", label: tPreview("mobile"), icon: <DeviceMobile size={14} /> },
          ]}
        />
        <Segmented
          label={tPreview("theme")}
          value={state.dark}
          onChange={(dark) => set({ dark })}
          options={[
            { value: false, label: tPreview("light"), icon: <Sun size={14} /> },
            { value: true, label: tPreview("dark"), icon: <Moon size={14} /> },
          ]}
        />
        <Segmented
          label={t("language")}
          value={state.locale}
          onChange={(locale) => set({ locale })}
          options={EMAIL_LOCALES.map((code) => ({ value: code, label: code.toUpperCase() }))}
        />
        {sampleSets.length > 1 ? (
          <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            {t("sampleData")}
            <select
              value={state.sampleSetId ?? ""}
              onChange={(event) => set({ sampleSetId: event.target.value || null })}
              className="h-8 max-w-[180px] rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink"
            >
              {sampleSets.map((sample) => (
                <option key={sample.id} value={sample.builtIn ? "" : sample.id}>
                  {sample.builtIn ? t("defaultSample") : sample.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {/* The inbox. For a block the envelope is generic: it has no sender of its own. */}
      <div className={cn("min-h-0 flex-1 overflow-auto p-3 sm:p-5", state.dark ? "bg-[#0b0c0e]" : "bg-surface-2")}>
        <div
          className={cn(
            "mx-auto overflow-hidden border shadow-sm transition-[max-width] duration-200",
            mobile ? "max-w-[390px] rounded-[28px]" : "max-w-[760px] rounded-xl",
            state.dark ? "border-white/10 bg-[#17181b] text-white" : "border-border bg-white text-[#18181b]",
          )}
        >
          <div className={cn("border-b px-4 pb-3 pt-4 sm:px-5", state.dark ? "border-white/10" : "border-black/[0.07]")}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug">{rendered?.subject ?? title}</h2>
              {rendered ? <SourceNote rendered={rendered} locale={state.locale} /> : null}
            </div>
            <div className="mt-3 flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#4f46e5] text-[14px] font-semibold text-white"
              >
                {initial}
              </span>
              <div className="min-w-0 flex-1 text-[12.5px] leading-5">
                <p className="truncate">
                  <span className="font-semibold">{rendered?.fromName || "WarpTalk"}</span>{" "}
                  {rendered?.fromAddress ? (
                    <span className={state.dark ? "text-white/55" : "text-black/50"}>&lt;{rendered.fromAddress}&gt;</span>
                  ) : null}
                </p>
                {rendered?.toAddress ? (
                  <p className={cn("truncate", state.dark ? "text-white/55" : "text-black/50")}>
                    {t("to")} {rendered.toName} &lt;{rendered.toAddress}&gt;
                  </p>
                ) : null}
              </div>
              <span className={cn("shrink-0 text-[11.5px]", state.dark ? "text-white/45" : "text-black/45")}>{now}</span>
            </div>
            {rendered?.preheader ? (
              <p className={cn("mt-2 truncate text-[12.5px]", state.dark ? "text-white/55" : "text-black/55")}>
                <span className="sr-only">{t("preheader")}: </span>
                {rendered.preheader}
              </p>
            ) : null}
          </div>

          <div role="tablist" aria-label={tPreview("format")} className={cn("flex gap-1 px-4 pt-2 sm:px-5", state.dark ? "text-white/70" : "text-black/60")}>
            {(["html", "text"] as const).map((format) => (
              <button
                key={format}
                type="button"
                role="tab"
                aria-selected={state.format === format}
                onClick={() => set({ format })}
                className={cn(
                  "rounded-md px-2 py-1 text-[12px]",
                  state.format === format && (state.dark ? "bg-white/10 text-white" : "bg-black/[0.06] text-black"),
                )}
              >
                {format === "html" ? t("formatHtml") : t("formatText")}
              </button>
            ))}
          </div>

          {error ? (
            <div className="flex items-center gap-2 px-5 py-10 text-[13px] text-destructive">
              <WarningCircle size={16} /> {t("error")}
            </div>
          ) : !rendered ? (
            <div className={cn("m-4 h-[520px] animate-pulse rounded-lg", state.dark ? "bg-white/5" : "bg-black/[0.04]")} aria-busy />
          ) : state.format === "html" ? (
            <iframe
              title={t("frameTitle", { name: title })}
              sandbox=""
              srcDoc={rendered.html}
              className={cn("block w-full border-0 transition-opacity", mobile ? "h-[640px]" : "h-[600px]", loading && "opacity-60")}
            />
          ) : (
            <pre
              className={cn(
                "overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-[12.5px] leading-relaxed",
                mobile ? "h-[640px]" : "h-[600px]",
                state.dark ? "text-white/80" : "text-black/75",
              )}
            >
              {rendered.text}
            </pre>
          )}
        </div>
      </div>

      {actions ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">{actions}</div> : null}
    </div>
  );
}

/** Opens the rendered email by itself in a new tab, still sandboxed. */
export function openRenderedInNewTab(rendered: EmailRenderedDto, labels: { title: string; to: string }, dark: boolean, lang: string) {
  const page = standalonePreviewDocument({
    title: labels.title,
    subject: rendered.subject,
    from: `${rendered.fromName} <${rendered.fromAddress}>`,
    to: `${labels.to} ${rendered.toName} <${rendered.toAddress}>`,
    preheader: rendered.preheader,
    html: rendered.html,
    dark,
    lang,
  });
  const url = URL.createObjectURL(new Blob([page], { type: "text/html" }));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function EmailInboxPreviewDialog({
  open,
  onOpenChange,
  templateKey,
  templateName,
  initialLocale = "en",
  canSendTest = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateKey: string;
  templateName: string;
  initialLocale?: string;
  canSendTest?: boolean;
}) {
  const t = useTranslations("adminCms.library.inbox");
  const [state, setState] = useState<InboxPreviewState>({ ...DEFAULT_INBOX_STATE, locale: initialLocale });
  const [testing, setTesting] = useState(false);
  const detail = useAdminEmailTemplate(open ? templateKey : undefined);
  const rendered = useRenderedEmail(
    open ? templateKey : undefined,
    { locale: state.locale, dark: state.dark, sampleSetId: state.sampleSetId },
    open,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[min(980px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogTitle className="sr-only">{t("dialogTitle", { name: templateName })}</DialogTitle>
          <EmailInboxPreviewPanel
            title={templateName}
            rendered={rendered.data}
            loading={rendered.isFetching}
            error={rendered.isError}
            state={state}
            onState={setState}
            sampleSets={detail.data?.sampleSets ?? []}
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!rendered.data}
                  onClick={() => rendered.data && openRenderedInNewTab(rendered.data, { title: templateName, to: t("to") }, state.dark, state.locale)}
                >
                  <ArrowSquareOut size={14} />
                  {t("openInNewTab")}
                </Button>
                {canSendTest ? (
                  <Button variant="outline" size="sm" onClick={() => setTesting(true)}>
                    <PaperPlaneTilt size={14} />
                    {t("sendTest")}
                  </Button>
                ) : null}
                <Link
                  href={`/admin/email-templates/${encodeURIComponent(templateKey)}`}
                  className={buttonVariants({ size: "sm" })}
                  onClick={() => onOpenChange(false)}
                >
                  <PencilSimple size={14} />
                  {t("edit")}
                </Link>
              </>
            }
          />
        </DialogContent>
      </Dialog>
      {testing ? (
        <SendTestEmailDialog
          open
          onOpenChange={setTesting}
          templateKey={templateKey}
          templateName={templateName}
          locale={state.locale}
          sampleSetId={state.sampleSetId}
        />
      ) : null}
    </>
  );
}

/** The same "as received" view for a layout or block, shown inside an email of the admin's choice. */
export function BlockPreviewDialog({
  open,
  onOpenChange,
  blockId,
  blockName,
  editHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockId: string;
  blockName: string;
  editHref: string;
}) {
  const t = useTranslations("adminCms.library.inbox");
  const [state, setState] = useState<InboxPreviewState>(DEFAULT_INBOX_STATE);
  const [templateKey, setTemplateKey] = useState<string>("");
  const templates = useAdminEmailTemplates();
  const rendered = useRenderedBlock(open ? blockId : undefined, { dark: state.dark, locale: state.locale, templateKey: templateKey || null }, open);
  const asRendered: EmailRenderedDto | undefined = rendered.data
    ? {
        subject: rendered.data.subject,
        preheader: rendered.data.preheader,
        html: rendered.data.html,
        text: rendered.data.text,
        layoutName: rendered.data.layoutName,
        localeUsed: state.locale,
        // A block has no "sent version" of its own; no source label is shown.
        sourceUsed: "BLOCK",
        version: 0,
        fromName: "WarpTalk",
        fromAddress: "",
        toName: "",
        toAddress: "",
      }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(980px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogTitle className="sr-only">{t("dialogTitle", { name: blockName })}</DialogTitle>
        <EmailInboxPreviewPanel
          title={blockName}
          rendered={asRendered}
          loading={rendered.isFetching}
          error={rendered.isError}
          state={state}
          onState={setState}
          sampleSets={[]}
          actions={
            <>
              <label className="mr-auto flex items-center gap-1.5 text-[12px] text-ink-muted">
                {t("previewWith")}
                <select
                  value={templateKey}
                  onChange={(event) => setTemplateKey(event.target.value)}
                  className="h-8 max-w-[240px] rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink"
                >
                  <option value="">{t("sampleContent")}</option>
                  {(templates.data ?? [])
                    .filter((template) => template.status !== "DELETED")
                    .map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.name}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                variant="outline"
                size="sm"
                disabled={!asRendered}
                onClick={() => asRendered && openRenderedInNewTab(asRendered, { title: blockName, to: t("to") }, state.dark, state.locale)}
              >
                <ArrowSquareOut size={14} />
                {t("openInNewTab")}
              </Button>
              <Link href={editHref} className={buttonVariants({ size: "sm" })} onClick={() => onOpenChange(false)}>
                <PencilSimple size={14} />
                {t("edit")}
              </Link>
            </>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
