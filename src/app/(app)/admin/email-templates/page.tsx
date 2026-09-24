"use client";

/**
 * Email templates — every transactional email the platform sends, as editable cards.
 *
 * The list comes from the notification service's EmailTemplateCatalog, which names the sender of
 * each email; nothing here is a hardcoded array. Every one of those senders (auth and workspace
 * over Resend, translation-room over SMTP, the notification service itself) builds its email
 * through the same composer, which reads what is saved here and falls back to the built-in
 * wording — so an edit on this screen is what the next email says.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  EnvelopeSimple,
  Eye,
  PaperPlaneTilt,
  PencilSimple,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader } from "@/components/admin/admin-page-chrome";
import {
  CHIP_TONES,
  CmsCard,
  CmsCardGrid,
  CmsChip,
  EditedBy,
} from "@/components/admin/cms/cms-shared";
import { EmailPreviewFrame } from "@/components/admin/cms/email-template-preview-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import {
  ADMIN_EMAIL_TEMPLATE_KEYS,
  useAdminEmailTemplate,
  useAdminEmailTemplates,
  useEmailTemplatePreview,
  useResetEmailTemplate,
  useSendTestEmail,
} from "@/hooks/use-admin-email-templates";
import { matchesFilter, type TemplateFilter } from "@/lib/admin/email-template-editor";
import { getErrorMessage } from "@/lib/api/errors";
import { adminEmailTemplateService } from "@/services/admin-email-template.service";
import type { EmailTemplateSummaryDto } from "@/types/admin-cms";

const FILTERS: TemplateFilter[] = ["all", "live", "dormant", "customized"];

export default function AdminEmailTemplatesPage() {
  const t = useTranslations("adminCms.emailTemplates");
  const listQuery = useAdminEmailTemplates();
  const [filter, setFilter] = useState<TemplateFilter>("all");
  const [previewing, setPreviewing] = useState<EmailTemplateSummaryDto | null>(null);
  const [resetting, setResetting] = useState<EmailTemplateSummaryDto | null>(null);

  const templates = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const visible = useMemo(() => templates.filter((item) => matchesFilter(item, filter)), [templates, filter]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((value) => [value, templates.filter((item) => matchesFilter(item, value)).length]),
      ) as Record<TemplateFilter, number>,
    [templates],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<EnvelopeSimple size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
          >
            <ArrowsClockwise size={14} className={listQuery.isFetching ? "animate-spin" : undefined} />
            {t("refresh")}
          </Button>
        }
      />

      <FilterChipGroup
        label={t("filterAria")}
        className="border-b border-border py-3"
        trailing={
          <span className="text-[12px] text-ink-muted">{t("providersNote")}</span>
        }
      >
        {FILTERS.map((value) => (
          <FilterChip
            key={value}
            selected={filter === value}
            onClick={() => setFilter(value)}
            badge={listQuery.data ? counts[value] : undefined}
          >
            {t(`filters.${value}`)}
          </FilterChip>
        ))}
      </FilterChipGroup>

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
                  <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-56 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
                </div>
              </CmsCard>
            ))}
          </CmsCardGrid>
        ) : visible.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-1 px-4 py-10 text-center text-[13px] text-ink-muted">
            {t("emptyFilter")}
          </p>
        ) : (
          <CmsCardGrid>
            {visible.map((template) => (
              <EmailTemplateCard
                key={template.key}
                template={template}
                onPreview={() => setPreviewing(template)}
                onReset={() => setResetting(template)}
              />
            ))}
          </CmsCardGrid>
        )}
      </div>

      <PreviewDialog template={previewing} onClose={() => setPreviewing(null)} />
      <ResetDialog template={resetting} onClose={() => setResetting(null)} />
    </AdminPage>
  );
}

function EmailTemplateCard({
  template,
  onPreview,
  onReset,
}: {
  template: EmailTemplateSummaryDto;
  onPreview: () => void;
  onReset: () => void;
}) {
  const t = useTranslations("adminCms.emailTemplates");
  const queryClient = useQueryClient();
  const sendTest = useSendTestEmail();
  const href = `/admin/email-templates/${encodeURIComponent(template.key)}`;

  // The card has only the summary; the test sends what senders use right now, so it reads the
  // current content first (usually already cached from a preview or the editor).
  const handleSendTest = async () => {
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.detail(template.key),
        queryFn: () => adminEmailTemplateService.get(template.key),
        staleTime: 10_000,
      });
      const result = await sendTest.mutateAsync({ key: template.key, draft: detail.current });
      toast.success(t("toasts.testSent", { email: result.sentTo }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.testFailed")));
    }
  };

  return (
    <CmsCard>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <CmsChip className={template.isLive ? CHIP_TONES.positive : CHIP_TONES.neutral}>
            {template.isLive ? t("status.live") : t("status.dormant")}
          </CmsChip>
          {template.isCustomized ? (
            <CmsChip className={CHIP_TONES.accent}>{t("status.customized", { version: template.version })}</CmsChip>
          ) : (
            <CmsChip className={CHIP_TONES.neutral}>{t("status.default")}</CmsChip>
          )}
        </div>

        <Link href={href} className="mt-3 block">
          <h2 className="text-[15px] font-semibold leading-snug text-ink group-hover:underline group-hover:underline-offset-2">
            {template.name}
          </h2>
        </Link>
        <p className="mt-1 text-[12.5px] text-ink-muted">{template.description}</p>

        <div className="mt-3 rounded-md border border-border bg-surface-2/50 px-3 py-2">
          <p className="text-[10.5px] uppercase tracking-wide text-ink-subtle">{t("card.subject")}</p>
          <p className="mt-0.5 line-clamp-2 font-mono text-[12px] text-ink">{template.subject}</p>
        </div>

        {template.dormantReason ? (
          <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-300">{template.dormantReason}</p>
        ) : null}

        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 pt-4 text-[12px]">
          <dt className="text-ink-subtle">{t("card.service")}</dt>
          <dd className="truncate text-right text-ink-muted">{template.service}</dd>
          <dt className="text-ink-subtle">{t("card.provider")}</dt>
          <dd className="text-right">
            <CmsChip className={template.provider === "SMTP" ? CHIP_TONES.info : CHIP_TONES.neutral}>
              {template.provider}
            </CmsChip>
          </dd>
        </dl>
        <p className="mt-2 truncate text-[11.5px] text-ink-subtle">
          {template.isCustomized || template.updatedAt ? (
            <EditedBy at={template.updatedAt} by={template.updatedBy} />
          ) : (
            t("card.builtIn")
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-border px-3 py-2">
        <Link href={href} className={buttonVariants({ size: "sm" })}>
          <PencilSimple size={13} />
          {t("actions.edit")}
        </Link>
        <Button variant="ghost" size="sm" onClick={onPreview}>
          <Eye size={13} />
          {t("actions.preview")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void handleSendTest()} disabled={sendTest.isPending}>
          <PaperPlaneTilt size={13} />
          {sendTest.isPending ? t("actions.sending") : t("actions.sendTest")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={onReset}
          disabled={!template.isCustomized}
          title={template.isCustomized ? undefined : t("actions.resetDisabled")}
        >
          <ArrowCounterClockwise size={13} />
          {t("actions.reset")}
        </Button>
      </div>
    </CmsCard>
  );
}

function PreviewDialog({ template, onClose }: { template: EmailTemplateSummaryDto | null; onClose: () => void }) {
  const t = useTranslations("adminCms.emailTemplates");
  const detail = useAdminEmailTemplate(template?.key);
  const preview = useEmailTemplatePreview(template?.key, detail.data?.current ?? null);
  const [view, setView] = useState<"html" | "text">("html");

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template?.name}</DialogTitle>
          <DialogDescription>{t("preview.description")}</DialogDescription>
        </DialogHeader>
        <FilterChipGroup label={t("preview.viewAria")} className="py-3">
          <FilterChip selected={view === "html"} onClick={() => setView("html")}>
            {t("preview.html")}
          </FilterChip>
          <FilterChip selected={view === "text"} onClick={() => setView("text")}>
            {t("preview.text")}
          </FilterChip>
        </FilterChipGroup>
        {detail.isError || preview.isError ? (
          <p className="py-6 text-[13px] text-destructive">{t("preview.error")}</p>
        ) : (
          <EmailPreviewFrame preview={preview.data} view={view} title={template?.name ?? ""} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({ template, onClose }: { template: EmailTemplateSummaryDto | null; onClose: () => void }) {
  const t = useTranslations("adminCms.emailTemplates");
  const reset = useResetEmailTemplate();

  const confirm = async () => {
    if (!template) return;
    try {
      await reset.mutateAsync(template.key);
      toast.success(t("toasts.reset", { name: template.name }));
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.resetFailed")));
    }
  };

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("resetDialog.title", { name: template?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("resetDialog.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("resetDialog.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={reset.isPending}>
            {t("resetDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
