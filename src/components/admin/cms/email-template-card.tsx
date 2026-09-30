"use client";

/**
 * One email on the Email templates grid: a real thumbnail of what recipients get, the subject as
 * they read it (sample values filled in — never `{{placeholders}}`), and everything that can be
 * done to it.
 *
 * Presentational: the page passes the thumbnail and the handlers, so the dev preview can render
 * the same card from fixtures.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Archive,
  ArrowCounterClockwise,
  DotsThree,
  Eye,
  PaperPlaneRight,
  PaperPlaneTilt,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react/dist/ssr";

import { CmsSelectBox } from "@/components/admin/cms/cms-list";
import { CHIP_TONES, CmsCard, CmsChip, EditedBy } from "@/components/admin/cms/cms-shared";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isCustomTemplate, isDeletedTemplate } from "@/lib/admin/email-library";
import { localeState, type LocaleState } from "@/lib/admin/email-template-editor";
import { cn } from "@/lib/utils";
import { EMAIL_LOCALES, type EmailTemplateListItemDto } from "@/types/admin-cms";

const LOCALE_DOT: Record<LocaleState, string> = {
  PUBLISHED: "bg-emerald-500",
  CHANGES: "bg-amber-500",
  DRAFT_ONLY: "bg-sky-500",
  ARCHIVED: "bg-ink-subtle/50",
  MISSING: "border border-border bg-transparent",
};

export function LocalePills({ template }: { template: EmailTemplateListItemDto }) {
  const t = useTranslations("adminCms.emails.localeStates");
  return (
    <span className="flex flex-wrap gap-1">
      {EMAIL_LOCALES.map((code) => {
        const state = localeState(template.variants.find((variant) => variant.locale === code));
        return (
          <span
            key={code}
            title={`${code.toUpperCase()}: ${t(state)}`}
            className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10.5px] font-medium uppercase text-ink-muted"
          >
            <span className={cn("size-1.5 rounded-full", LOCALE_DOT[state])} aria-hidden />
            {code}
            <span className="sr-only">{t(state)}</span>
          </span>
        );
      })}
    </span>
  );
}

export function EmailStatusChips({ template }: { template: EmailTemplateListItemDto }) {
  const t = useTranslations("adminCms.emails.chips");
  const tCategory = useTranslations("adminCms.library.categories");
  const customized = template.variants.some((variant) => variant.publishedVersion > 0);
  if (isDeletedTemplate(template)) return <CmsChip className={CHIP_TONES.neutral}>{t("archived")}</CmsChip>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <CmsChip className={template.isLive ? CHIP_TONES.positive : CHIP_TONES.neutral}>{template.isLive ? t("live") : t("dormant")}</CmsChip>
      {isCustomTemplate(template) ? (
        <CmsChip className={CHIP_TONES.info}>{tCategory(template.category ?? "TRANSACTIONAL_CUSTOM")}</CmsChip>
      ) : customized ? (
        <CmsChip className={CHIP_TONES.accent}>{t("customized")}</CmsChip>
      ) : null}
      {template.hasDraftChanges ? <CmsChip className={CHIP_TONES.warning}>{t("draft")}</CmsChip> : null}
    </span>
  );
}

export interface EmailCardActions {
  onPreview: () => void;
  onSendTest: () => void;
  onReset: () => void;
  onArchiveAll: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onSendEmail: () => void;
}

export function EmailTemplateCard({
  template,
  thumbnail,
  selected,
  onSelect,
  actions,
  canSend,
}: {
  template: EmailTemplateListItemDto;
  thumbnail: ReactNode;
  selected: boolean;
  onSelect: () => void;
  actions: EmailCardActions;
  /** content.email_send: offer "Send email" on custom templates. */
  canSend: boolean;
}) {
  const t = useTranslations("adminCms.emails");
  const tLib = useTranslations("adminCms.library.card");
  const href = `/admin/email-templates/${encodeURIComponent(template.key)}`;
  const custom = isCustomTemplate(template);
  const deleted = isDeletedTemplate(template);
  const subject = template.renderedSubject || template.subject;
  const englishPublished = template.variants.some((v) => v.locale === "en" && v.status === "ACTIVE" && v.publishedVersion > 0);

  return (
    <CmsCard className={cn("min-h-0", selected && "border-primary/50 ring-1 ring-primary/30", deleted && "opacity-80")}>
      <div className="p-3 pb-0">{thumbnail}</div>
      <div className="flex flex-1 flex-col p-4 pt-3">
        <div className="flex items-start gap-2.5">
          <CmsSelectBox checked={selected} onChange={onSelect} label={t("selectOne", { name: template.name })} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate text-[14px] font-semibold text-ink hover:underline">
              {template.name}
            </Link>
          </div>
          <EmailStatusChips template={template} />
        </div>
        <p className="mt-2 line-clamp-1 text-[12.5px] font-medium text-ink" title={subject}>
          {subject}
        </p>
        {template.renderedPreheader ? <p className="line-clamp-1 text-[12px] text-ink-muted">{template.renderedPreheader}</p> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-muted">
          <LocalePills template={template} />
          <span>
            {custom ? tLib("sentByYou") : `${template.service} · ${template.provider}`}
            {template.layoutName ? ` · ${template.layoutName}` : ""}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-ink-subtle">
          <span className="tabular-nums">{t("card.sent30", { sent: template.last30Days.sent, failed: template.last30Days.failed })}</span>
          <EditedBy at={template.updatedAt} by={template.updatedBy} />
        </div>
        {deleted && template.deleteReason ? <p className="mt-2 text-[11.5px] italic text-ink-subtle">{tLib("deletedBecause", { reason: template.deleteReason })}</p> : null}
        {!template.isLive && !deleted && template.dormantReason ? <p className="mt-2 text-[11.5px] italic text-ink-subtle">{template.dormantReason}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1.5">
        {deleted ? (
          <Button variant="ghost" size="sm" onClick={actions.onRestore}>
            <ArrowCounterClockwise size={14} />
            {tLib("restore")}
          </Button>
        ) : (
          <>
            <Link href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <PencilSimple size={14} />
              {t("actions.edit")}
            </Link>
            <Button variant="ghost" size="sm" onClick={actions.onPreview}>
              <Eye size={14} />
              {t("actions.preview")}
            </Button>
            <Button variant="ghost" size="sm" onClick={actions.onSendTest}>
              <PaperPlaneTilt size={14} />
              {t("actions.sendTest")}
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={tLib("more")} />}>
            <DotsThree size={16} weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[240px]">
            {custom && !deleted && canSend ? (
              <DropdownMenuItem className="cursor-pointer gap-2" disabled={!englishPublished} onClick={actions.onSendEmail}>
                <PaperPlaneRight size={14} />
                <span className="flex flex-col">
                  {tLib("sendEmail")}
                  {!englishPublished ? <span className="text-[11px] text-ink-subtle">{tLib("publishFirst")}</span> : null}
                </span>
              </DropdownMenuItem>
            ) : null}
            {!custom ? (
              <>
                <DropdownMenuItem className="cursor-pointer gap-2" onClick={actions.onReset}>
                  <ArrowCounterClockwise size={14} />
                  {t("actions.reset")}
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer gap-2" onClick={actions.onArchiveAll}>
                  <Archive size={14} />
                  <span className="flex flex-col">
                    {tLib("archiveAll")}
                    <span className="text-[11px] text-ink-subtle">{tLib("archiveAllHint")}</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="gap-2">
                  <Trash size={14} />
                  <span className="flex flex-col">
                    {tLib("delete")}
                    <span className="text-[11px] text-ink-subtle">{tLib("builtInNoDelete", { service: template.service })}</span>
                  </span>
                </DropdownMenuItem>
              </>
            ) : deleted ? (
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={actions.onRestore}>
                <ArrowCounterClockwise size={14} />
                {tLib("restore")}
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2 text-destructive" onClick={actions.onDelete}>
                  <Trash size={14} />
                  {tLib("delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CmsCard>
  );
}
