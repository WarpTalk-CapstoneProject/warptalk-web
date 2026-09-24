"use client";

/**
 * Email templates: the CMS for every email the platform sends.
 *
 * Three sections, because content and templates are managed separately:
 *   Emails   the CONTENT — one entry per email a sender composes (EmailTemplateCatalog), each with
 *            an en/vi/ja variant that has a draft and a published side. Senders read only the
 *            published side; a locale with none falls back to English, then to the built-in text.
 *   Layouts  the TEMPLATES an email is poured into: the HTML shell, its plain-text frame and its
 *            dark-mode CSS. One is the default; an email can pick another.
 *   Blocks   reusable snippets (`{{> signature}}`) any email or layout can include.
 *
 * Everything here is read from the notification service; nothing is a hardcoded list.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArrowCounterClockwise,
  Copy,
  EnvelopeSimple,
  Eye,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Stack,
  Star,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { CmsTabBar, useConfirm, useHashTab } from "@/components/admin/cms/cms-editor";
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
import { CHIP_TONES, CmsCard, CmsCardGrid, CmsChip, EditedBy, useCmsDateFormatter } from "@/components/admin/cms/cms-shared";
import { SendTestEmailDialog } from "@/components/admin/cms/email-send-test-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminEmailTemplates, useEmailBulk, useResetEmailToDefault } from "@/hooks/use-admin-email-templates";
import { useCreateEmailBlock, useEmailBlockBulk, useEmailBlocks } from "@/hooks/use-admin-email-blocks";
import { prune, toggleAll, toggleOne } from "@/lib/admin/cms-selection";
import {
  BLOCK_KEY_PATTERN,
  blockStatus,
  compareTemplates,
  localeState,
  matchesFilter,
  matchesSearch,
  slugify,
  type BlockStatus,
  type LocaleState,
  type TemplateFilter,
  type TemplateSort,
} from "@/lib/admin/email-template-editor";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { EMAIL_LOCALES, type BulkResultDto, type EmailBlockDto, type EmailBlockKind, type EmailTemplateListItemDto } from "@/types/admin-cms";

const SECTIONS = ["emails", "layouts", "blocks"] as const;
type Section = (typeof SECTIONS)[number];

export default function EmailTemplatesPage() {
  const t = useTranslations("adminCms.emails");
  const [section, setSection] = useHashTab(SECTIONS, "emails");
  const [creating, setCreating] = useState<EmailBlockKind | null>(null);
  const templates = useAdminEmailTemplates();
  const layouts = useEmailBlocks("LAYOUT");
  const blocks = useEmailBlocks("PARTIAL");

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<EnvelopeSimple size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          section === "emails" ? null : (
            <Button size="sm" onClick={() => setCreating(section === "layouts" ? "LAYOUT" : "PARTIAL")}>
              <Plus size={14} />
              {section === "layouts" ? t("newLayout") : t("newBlock")}
            </Button>
          )
        }
      />

      <div className="mt-4">
        <CmsTabBar<Section>
          label={t("sectionsLabel")}
          value={section}
          onChange={setSection}
          tabs={[
            { value: "emails", label: t("sections.emails"), badge: templates.data?.length },
            { value: "layouts", label: t("sections.layouts"), badge: layouts.data?.length },
            { value: "blocks", label: t("sections.blocks"), badge: blocks.data?.length },
          ]}
        />
      </div>

      {section === "emails" ? <EmailsSection /> : null}
      {section === "layouts" ? <BlocksSection kind="LAYOUT" onCreate={() => setCreating("LAYOUT")} /> : null}
      {section === "blocks" ? <BlocksSection kind="PARTIAL" onCreate={() => setCreating("PARTIAL")} /> : null}

      <CreateBlockDialog kind={creating} onClose={() => setCreating(null)} />
    </AdminPage>
  );
}

// ── Emails ──────────────────────────────────────────────────────────────────────────────────

const EMAIL_FILTERS: readonly TemplateFilter[] = ["all", "live", "dormant", "customized", "draft"];

function facts(template: EmailTemplateListItemDto) {
  return {
    isLive: template.isLive,
    isCustomized: template.variants.some((variant) => variant.publishedVersion > 0),
    hasDraftChanges: template.hasDraftChanges,
  };
}

function reportBulk(result: BulkResultDto, done: string, partly: (failed: number, first: string) => string) {
  if (result.failed === 0) toast.success(done);
  else toast.error(partly(result.failed, result.items.find((item) => !item.succeeded)?.error ?? ""));
}

function EmailsSection() {
  const t = useTranslations("adminCms.emails");
  const tCommon = useTranslations("adminCms.common");
  const templates = useAdminEmailTemplates();
  const bulk = useEmailBulk();
  const reset = useResetEmailToDefault();
  const [confirm, confirmDialog] = useConfirm();
  const [filter, setFilter] = useState<TemplateFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TemplateSort>("name");
  const [view, setView] = useListView("wt.admin.email-templates.view");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkLocale, setBulkLocale] = useState<string>("");
  const [testing, setTesting] = useState<EmailTemplateListItemDto | null>(null);
  // Read by the duplicate dialog's confirm: the dialog captures its request when it opens.
  const duplicateTarget = useRef("vi");

  const all = useMemo(() => templates.data ?? [], [templates.data]);
  const visible = useMemo(
    () =>
      all
        .filter((template) => matchesFilter(facts(template), filter))
        .filter((template) =>
          matchesSearch([template.name, template.key, template.description, template.subject, template.service, template.trigger], search),
        )
        .sort((a, b) =>
          compareTemplates(sort, { name: a.name, updatedAt: a.updatedAt, sent: a.last30Days.sent }, { name: b.name, updatedAt: b.updatedAt, sent: b.last30Days.sent }),
        ),
    [all, filter, search, sort],
  );
  const visibleKeys = visible.map((template) => template.key);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a filter change drops rows it hid
    setSelected((current) => prune(current, visibleKeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKeys.join("|")]);

  const counts = Object.fromEntries(EMAIL_FILTERS.map((option) => [option, all.filter((template) => matchesFilter(facts(template), option)).length]));
  const locale = bulkLocale || null;

  const runBulk = (action: "publish" | "discard" | "archive", done: string) =>
    confirm({
      title: t(`bulk.${action}.title`, { count: selected.length }),
      description: t(`bulk.${action}.description`, { locale: locale ? locale.toUpperCase() : t("bulk.allLocales") }),
      confirmLabel: t(`bulk.${action}.confirm`),
      destructive: action !== "publish",
      onConfirm: async () => {
        try {
          const result = await bulk.mutateAsync({ action, keys: selected, locale, targetLocale: null });
          reportBulk(result, done, (failed, first) => tCommon("bulk.partial", { failed, error: first }));
          setSelected([]);
        } catch (caught) {
          toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
        }
      },
    });

  const runDuplicate = () => {
    duplicateTarget.current = EMAIL_LOCALES.find((code) => code !== (locale ?? "en")) ?? "vi";
    confirm({
      title: t("bulk.duplicate.title", { count: selected.length }),
      description: t("bulk.duplicate.description", { locale: (locale ?? "en").toUpperCase() }),
      confirmLabel: t("bulk.duplicate.confirm"),
      body: (
        <label className="block text-[12px] text-ink-muted">
          {t("bulk.duplicate.target")}
          <select
            defaultValue={duplicateTarget.current}
            onChange={(event) => (duplicateTarget.current = event.target.value)}
            className="mt-1.5 block h-8 w-full rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink"
          >
            {EMAIL_LOCALES.filter((code) => code !== (locale ?? "en")).map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      ),
      onConfirm: async () => {
        try {
          const result = await bulk.mutateAsync({ action: "duplicate", keys: selected, locale: locale ?? "en", targetLocale: duplicateTarget.current });
          reportBulk(result, t("toasts.duplicated"), (failed, first) => tCommon("bulk.partial", { failed, error: first }));
          setSelected([]);
        } catch (caught) {
          toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
        }
      },
    });
  };

  const askReset = (template: EmailTemplateListItemDto) =>
    confirm({
      title: t("resetDialog.title", { name: template.name }),
      description: t("resetDialog.description"),
      confirmLabel: t("resetDialog.confirm"),
      destructive: true,
      onConfirm: async () => {
        try {
          await reset.mutateAsync({ key: template.key, locale: "en" });
          toast.success(t("toasts.reset"));
        } catch (caught) {
          toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
        }
      },
    });

  if (templates.isError) {
    return (
      <AdminPanel className="mt-5 flex items-start gap-3 px-4 py-10 text-sm">
        <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">{t("loadError")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void templates.refetch()}>
            {tCommon("retry")}
          </Button>
        </div>
      </AdminPanel>
    );
  }

  return (
    <>
      <CmsToolbar
        chips={
          <FilterChipGroup label={t("filterLabel")}>
            {EMAIL_FILTERS.map((option) => (
              <FilterChip key={option} selected={filter === option} onClick={() => setFilter(option)} badge={templates.data ? counts[option] : undefined}>
                {t(`filters.${option}`)}
              </FilterChip>
            ))}
          </FilterChipGroup>
        }
        controls={
          <>
            <CmsSearchInput value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
            <CmsSortSelect<TemplateSort>
              value={sort}
              onChange={setSort}
              options={[
                { value: "name", label: t("sort.name") },
                { value: "updated", label: t("sort.updated") },
                { value: "sent", label: t("sort.sent") },
              ]}
            />
            <CmsViewToggle view={view} onChange={setView} />
          </>
        }
      />

      <div className="mt-4">
        {templates.isPending ? (
          <CmsCardGrid>
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index} className="h-[240px] animate-pulse rounded-lg bg-surface-2" />
            ))}
          </CmsCardGrid>
        ) : visible.length === 0 ? (
          <CmsEmptyState
            icon={<EnvelopeSimple size={18} />}
            title={search || filter !== "all" ? t("empty.filtered") : t("empty.none")}
            description={search || filter !== "all" ? t("empty.filteredHint") : undefined}
            action={
              search || filter !== "all" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  {tCommon("list.clearFilters")}
                </Button>
              ) : null
            }
          />
        ) : view === "cards" ? (
          <>
            <div className="mb-2 flex items-center gap-2 text-[12px] text-ink-muted">
              <CmsSelectAll selected={selected} visible={visibleKeys} onToggle={() => setSelected(toggleAll(selected, visibleKeys))} />
              {tCommon("list.selectAll")}
            </div>
            <CmsCardGrid>
              {visible.map((template) => (
                <EmailCard
                  key={template.key}
                  template={template}
                  selected={selected.includes(template.key)}
                  onSelect={() => setSelected(toggleOne(selected, template.key))}
                  onSendTest={() => setTesting(template)}
                  onReset={() => askReset(template)}
                />
              ))}
            </CmsCardGrid>
          </>
        ) : (
          <CmsTable
            head={
              <>
                <CmsTh className="w-10">
                  <CmsSelectAll selected={selected} visible={visibleKeys} onToggle={() => setSelected(toggleAll(selected, visibleKeys))} />
                </CmsTh>
                <CmsTh>{t("table.email")}</CmsTh>
                <CmsTh>{t("table.status")}</CmsTh>
                <CmsTh>{t("table.locales")}</CmsTh>
                <CmsTh>{t("table.sender")}</CmsTh>
                <CmsTh className="text-right">{t("table.sent30")}</CmsTh>
                <CmsTh>{t("table.updated")}</CmsTh>
                <CmsTh className="w-10" />
              </>
            }
          >
            {visible.map((template) => (
              <EmailRow
                key={template.key}
                template={template}
                selected={selected.includes(template.key)}
                onSelect={() => setSelected(toggleOne(selected, template.key))}
              />
            ))}
          </CmsTable>
        )}
      </div>

      <CmsBulkBar count={selected.length} onClear={() => setSelected([])}>
        <select
          aria-label={t("bulk.localeLabel")}
          value={bulkLocale}
          onChange={(event) => setBulkLocale(event.target.value)}
          className="h-7 rounded-md border border-border bg-surface-1 px-1.5 text-[12px] text-ink"
        >
          <option value="">{t("bulk.allLocales")}</option>
          {EMAIL_LOCALES.map((code) => (
            <option key={code} value={code}>
              {code.toUpperCase()}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={bulk.isPending} onClick={() => runBulk("publish", t("toasts.published"))}>
          <UploadSimple size={14} />
          {t("bulk.publish.action")}
        </Button>
        <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={() => runBulk("discard", t("toasts.discarded"))}>
          <ArrowCounterClockwise size={14} />
          {t("bulk.discard.action")}
        </Button>
        <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={runDuplicate}>
          <Copy size={14} />
          {t("bulk.duplicate.action")}
        </Button>
        <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={() => runBulk("archive", t("toasts.archived"))}>
          <Archive size={14} />
          {t("bulk.archive.action")}
        </Button>
      </CmsBulkBar>

      {testing ? (
        <SendTestEmailDialog
          open
          onOpenChange={(open) => (!open ? setTesting(null) : undefined)}
          templateKey={testing.key}
          templateName={testing.name}
        />
      ) : null}
      {confirmDialog}
    </>
  );
}

const LOCALE_DOT: Record<LocaleState, string> = {
  PUBLISHED: "bg-emerald-500",
  CHANGES: "bg-amber-500",
  DRAFT_ONLY: "bg-sky-500",
  ARCHIVED: "bg-ink-subtle/50",
  MISSING: "border border-border bg-transparent",
};

function LocalePills({ template }: { template: EmailTemplateListItemDto }) {
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

function StatusChips({ template }: { template: EmailTemplateListItemDto }) {
  const t = useTranslations("adminCms.emails.chips");
  const customized = template.variants.some((variant) => variant.publishedVersion > 0);
  return (
    <span className="flex flex-wrap items-center gap-1">
      <CmsChip className={template.isLive ? CHIP_TONES.positive : CHIP_TONES.neutral}>{template.isLive ? t("live") : t("dormant")}</CmsChip>
      {customized ? <CmsChip className={CHIP_TONES.accent}>{t("customized")}</CmsChip> : null}
      {template.hasDraftChanges ? <CmsChip className={CHIP_TONES.warning}>{t("draft")}</CmsChip> : null}
    </span>
  );
}

function EmailCard({
  template,
  selected,
  onSelect,
  onSendTest,
  onReset,
}: {
  template: EmailTemplateListItemDto;
  selected: boolean;
  onSelect: () => void;
  onSendTest: () => void;
  onReset: () => void;
}) {
  const t = useTranslations("adminCms.emails");
  const href = `/admin/email-templates/${encodeURIComponent(template.key)}`;
  return (
    <CmsCard className={cn(selected && "border-primary/50 ring-1 ring-primary/30")}>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2.5">
          <CmsSelectBox checked={selected} onChange={onSelect} label={t("selectOne", { name: template.name })} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate text-[14px] font-semibold text-ink hover:underline">
              {template.name}
            </Link>
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink-subtle">{template.key}</p>
          </div>
          <StatusChips template={template} />
        </div>
        <p className="mt-3 line-clamp-2 text-[12.5px] text-ink-muted">{template.description}</p>
        <div className="mt-3 rounded-md border border-border bg-surface-2/60 px-3 py-2">
          <p className="text-[10.5px] uppercase tracking-wide text-ink-subtle">{t("card.subject")}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-ink" title={template.subject}>
            {template.subject}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-muted">
          <LocalePills template={template} />
          <span>
            {template.service} · {template.provider}
            {template.layoutName ? ` · ${template.layoutName}` : ""}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-ink-subtle">
          <span className="tabular-nums">
            {t("card.sent30", { sent: template.last30Days.sent, failed: template.last30Days.failed })}
          </span>
          <EditedBy at={template.updatedAt} by={template.updatedBy} />
        </div>
        {!template.isLive && template.dormantReason ? (
          <p className="mt-2 text-[11.5px] italic text-ink-subtle">{template.dormantReason}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1.5">
        <Link href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <PencilSimple size={14} />
          {t("actions.edit")}
        </Link>
        <Link href={`${href}#preview`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <Eye size={14} />
          {t("actions.preview")}
        </Link>
        <Button variant="ghost" size="sm" onClick={onSendTest}>
          <PaperPlaneTilt size={14} />
          {t("actions.sendTest")}
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto text-ink-muted" onClick={onReset}>
          <ArrowCounterClockwise size={14} />
          {t("actions.reset")}
        </Button>
      </div>
    </CmsCard>
  );
}

function EmailRow({
  template,
  selected,
  onSelect,
}: {
  template: EmailTemplateListItemDto;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("adminCms.emails");
  const formatDate = useCmsDateFormatter();
  const router = useRouter();
  const href = `/admin/email-templates/${encodeURIComponent(template.key)}`;
  return (
    <tr className={cn("cursor-pointer hover:bg-surface-2/60", selected && "bg-primary/5")} onClick={() => router.push(href)}>
      <CmsTd>
        <CmsSelectBox checked={selected} onChange={onSelect} label={t("selectOne", { name: template.name })} />
      </CmsTd>
      <CmsTd>
        <Link href={href} onClick={(event) => event.stopPropagation()} className="font-medium text-ink hover:underline">
          {template.name}
        </Link>
        <p className="max-w-[340px] truncate text-[11.5px] text-ink-subtle">{template.subject}</p>
      </CmsTd>
      <CmsTd>
        <StatusChips template={template} />
      </CmsTd>
      <CmsTd>
        <LocalePills template={template} />
      </CmsTd>
      <CmsTd className="text-[12px] text-ink-muted">
        {template.service} · {template.provider}
      </CmsTd>
      <CmsTd className="text-right tabular-nums">
        {template.last30Days.sent.toLocaleString()}
        {template.last30Days.failed ? <span className="text-destructive"> / {template.last30Days.failed}</span> : null}
      </CmsTd>
      <CmsTd className="text-[12px] text-ink-muted">{formatDate(template.updatedAt)}</CmsTd>
      <CmsTd>
        <PencilSimple size={14} className="text-ink-subtle" />
      </CmsTd>
    </tr>
  );
}

// ── Layouts and blocks ──────────────────────────────────────────────────────────────────────

const BLOCK_FILTERS = ["all", "PUBLISHED", "CHANGES", "DRAFT", "ARCHIVED"] as const;
type BlockFilter = (typeof BLOCK_FILTERS)[number];
type BlockSort = "name" | "updated";

const BLOCK_STATUS_TONE: Record<BlockStatus, string> = {
  PUBLISHED: CHIP_TONES.positive,
  CHANGES: CHIP_TONES.warning,
  DRAFT: CHIP_TONES.info,
  ARCHIVED: CHIP_TONES.neutral,
};

function BlocksSection({ kind, onCreate }: { kind: EmailBlockKind; onCreate: () => void }) {
  const t = useTranslations("adminCms.blocks");
  const tCommon = useTranslations("adminCms.common");
  const list = useEmailBlocks(kind);
  const bulk = useEmailBlockBulk();
  const [confirm, confirmDialog] = useConfirm();
  const [filter, setFilter] = useState<BlockFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<BlockSort>("name");
  const [view, setView] = useListView(`wt.admin.email-${kind.toLowerCase()}.view`);
  const [selected, setSelected] = useState<string[]>([]);
  const noun = kind === "LAYOUT" ? "layout" : "block";

  const all = useMemo(() => list.data ?? [], [list.data]);
  const visible = useMemo(
    () =>
      all
        .filter((block) => filter === "all" || blockStatus(block) === filter)
        .filter((block) => matchesSearch([block.name, block.key, block.description], search))
        .sort((a, b) =>
          sort === "updated"
            ? Date.parse(b.draftUpdatedAt) - Date.parse(a.draftUpdatedAt)
            : Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name),
        ),
    [all, filter, search, sort],
  );
  const visibleIds = visible.map((block) => block.id);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a filter change drops rows it hid
    setSelected((current) => prune(current, visibleIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds.join("|")]);

  const selectedBlocks = all.filter((block) => selected.includes(block.id));
  const statuses = selectedBlocks.map(blockStatus);
  const can = {
    publish: statuses.some((status) => status === "DRAFT" || status === "CHANGES"),
    archive: statuses.some((status) => status !== "ARCHIVED"),
    delete: statuses.some((status) => status === "DRAFT"),
  };

  const runBulk = (action: "publish" | "archive" | "delete" | "duplicate") =>
    confirm({
      title: t(`bulk.${action}.title`, { count: selected.length, noun: t(`nouns.${noun}`, { count: selected.length }) }),
      description: t(`bulk.${action}.description`),
      confirmLabel: t(`bulk.${action}.confirm`),
      destructive: action === "archive" || action === "delete",
      onConfirm: async () => {
        try {
          const result = await bulk.mutateAsync({ action, ids: selected });
          reportBulk(result, t(`toasts.${action}`), (failed, first) => tCommon("bulk.partial", { failed, error: first }));
          setSelected([]);
        } catch (caught) {
          toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
        }
      },
    });

  return (
    <>
      <p className="mt-4 max-w-3xl text-[12.5px] text-ink-muted">{t(`${noun}Intro`)}</p>
      <CmsToolbar
        chips={
          <FilterChipGroup label={t("filterLabel")}>
            {BLOCK_FILTERS.map((option) => (
              <FilterChip
                key={option}
                selected={filter === option}
                onClick={() => setFilter(option)}
                badge={list.data ? all.filter((block) => option === "all" || blockStatus(block) === option).length : undefined}
              >
                {t(`filters.${option}`)}
              </FilterChip>
            ))}
          </FilterChipGroup>
        }
        controls={
          <>
            <CmsSearchInput value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
            <CmsSortSelect<BlockSort>
              value={sort}
              onChange={setSort}
              options={[
                { value: "name", label: t("sort.name") },
                { value: "updated", label: t("sort.updated") },
              ]}
            />
            <CmsViewToggle view={view} onChange={setView} />
          </>
        }
      />

      <div className="mt-4">
        {list.isError ? (
          <AdminPanel className="flex items-center gap-3 px-4 py-8 text-sm">
            <WarningCircle size={18} weight="duotone" className="shrink-0 text-destructive" />
            <span className="flex-1">{t("loadError")}</span>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              {tCommon("retry")}
            </Button>
          </AdminPanel>
        ) : list.isPending ? (
          <CmsCardGrid>
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="h-[200px] animate-pulse rounded-lg bg-surface-2" />
            ))}
          </CmsCardGrid>
        ) : visible.length === 0 ? (
          <CmsEmptyState
            icon={<Stack size={18} />}
            title={all.length === 0 ? t(`empty.${noun}`) : t("empty.filtered")}
            description={all.length === 0 ? t(`empty.${noun}Hint`) : undefined}
            action={
              all.length === 0 ? (
                <Button size="sm" onClick={onCreate}>
                  <Plus size={14} />
                  {t(`create.${noun}`)}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  {tCommon("list.clearFilters")}
                </Button>
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
              {visible.map((block) => (
                <BlockCard key={block.id} block={block} selected={selected.includes(block.id)} onSelect={() => setSelected(toggleOne(selected, block.id))} />
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
                <CmsTh>{t("table.name")}</CmsTh>
                <CmsTh>{t("table.status")}</CmsTh>
                <CmsTh>{t("table.version")}</CmsTh>
                <CmsTh>{t("table.usedBy")}</CmsTh>
                <CmsTh>{t("table.updated")}</CmsTh>
              </>
            }
          >
            {visible.map((block) => (
              <BlockRow key={block.id} block={block} selected={selected.includes(block.id)} onSelect={() => setSelected(toggleOne(selected, block.id))} />
            ))}
          </CmsTable>
        )}
      </div>

      <CmsBulkBar count={selected.length} onClear={() => setSelected([])}>
        {can.publish ? (
          <Button size="sm" disabled={bulk.isPending} onClick={() => runBulk("publish")}>
            <UploadSimple size={14} />
            {t("bulk.publish.action")}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={() => runBulk("duplicate")}>
          <Copy size={14} />
          {t("bulk.duplicate.action")}
        </Button>
        {can.archive ? (
          <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={() => runBulk("archive")}>
            <Archive size={14} />
            {t("bulk.archive.action")}
          </Button>
        ) : null}
        {can.delete ? (
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

function BlockCard({ block, selected, onSelect }: { block: EmailBlockDto; selected: boolean; onSelect: () => void }) {
  const t = useTranslations("adminCms.blocks");
  const status = blockStatus(block);
  const href = `/admin/email-templates/blocks/${block.id}`;
  return (
    <CmsCard className={cn("min-h-[200px]", selected && "border-primary/50 ring-1 ring-primary/30")}>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2.5">
          <CmsSelectBox checked={selected} onChange={onSelect} label={t("selectOne", { name: block.name })} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate text-[14px] font-semibold text-ink hover:underline">
              {block.name}
            </Link>
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink-subtle">
              {block.kind === "PARTIAL" ? `{{> ${block.key}}}` : block.key}
            </p>
          </div>
          <span className="flex flex-wrap items-center gap-1">
            {block.isDefault ? (
              <CmsChip className={CHIP_TONES.accent}>
                <Star size={10} weight="fill" />
                {t("default")}
              </CmsChip>
            ) : null}
            <CmsChip className={BLOCK_STATUS_TONE[status]}>{t(`statuses.${status}`)}</CmsChip>
          </span>
        </div>
        {block.description ? <p className="mt-3 line-clamp-2 text-[12.5px] text-ink-muted">{block.description}</p> : null}
        <p className="mt-3 text-[11.5px] text-ink-muted">
          {block.usedBy.length > 0 ? t("usedBy", { count: block.usedBy.length, first: block.usedBy.slice(0, 2).join(", ") }) : t("unused")}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11.5px] text-ink-subtle">
          <span>{block.publishedVersion > 0 ? t("version", { version: block.publishedVersion }) : t("neverPublished")}</span>
          <EditedBy at={block.draftUpdatedAt} by={block.draftUpdatedBy} />
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
      </div>
    </CmsCard>
  );
}

function BlockRow({ block, selected, onSelect }: { block: EmailBlockDto; selected: boolean; onSelect: () => void }) {
  const t = useTranslations("adminCms.blocks");
  const formatDate = useCmsDateFormatter();
  const router = useRouter();
  const status = blockStatus(block);
  const href = `/admin/email-templates/blocks/${block.id}`;
  return (
    <tr className={cn("cursor-pointer hover:bg-surface-2/60", selected && "bg-primary/5")} onClick={() => router.push(href)}>
      <CmsTd>
        <CmsSelectBox checked={selected} onChange={onSelect} label={t("selectOne", { name: block.name })} />
      </CmsTd>
      <CmsTd>
        <Link href={href} onClick={(event) => event.stopPropagation()} className="font-medium text-ink hover:underline">
          {block.name}
        </Link>
        {block.isDefault ? <span className="ml-2 text-[11px] text-ink-subtle">{t("default")}</span> : null}
        <p className="font-mono text-[11px] text-ink-subtle">{block.key}</p>
      </CmsTd>
      <CmsTd>
        <CmsChip className={BLOCK_STATUS_TONE[status]}>{t(`statuses.${status}`)}</CmsChip>
      </CmsTd>
      <CmsTd className="tabular-nums">{block.publishedVersion > 0 ? `v${block.publishedVersion}` : "—"}</CmsTd>
      <CmsTd className="max-w-[260px] truncate text-[12px] text-ink-muted">{block.usedBy.join(", ") || "—"}</CmsTd>
      <CmsTd className="text-[12px] text-ink-muted">{formatDate(block.draftUpdatedAt)}</CmsTd>
    </tr>
  );
}

function CreateBlockDialog({ kind, onClose }: { kind: EmailBlockKind | null; onClose: () => void }) {
  const t = useTranslations("adminCms.blocks.create");
  const tCommon = useTranslations("adminCms.common");
  const router = useRouter();
  const create = useCreateEmailBlock();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const effectiveKey = keyTouched ? key : slugify(name);
  const keyValid = BLOCK_KEY_PATTERN.test(effectiveKey);
  const noun = kind === "LAYOUT" ? "layout" : "block";

  const reset = () => {
    setName("");
    setKey("");
    setKeyTouched(false);
    setDescription("");
  };

  const submit = async () => {
    if (!kind) return;
    try {
      const created = await create.mutateAsync({
        kind,
        key: effectiveKey,
        name: name.trim(),
        description: description.trim() || null,
        html: kind === "LAYOUT" ? STARTER_LAYOUT : STARTER_BLOCK,
        text: kind === "LAYOUT" ? "{{content}}" : null,
        darkCss: null,
      });
      toast.success(t("created"));
      reset();
      onClose();
      router.push(`/admin/email-templates/blocks/${created.id}`);
    } catch (caught) {
      toast.error(getErrorMessage(caught, tCommon("toasts.failed")));
    }
  };

  return (
    <Dialog
      open={Boolean(kind)}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`${noun}Title`)}</DialogTitle>
          <DialogDescription>{t(`${noun}Description`)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="block-name" className="text-[12px] text-ink-muted">
              {t("name")}
            </Label>
            <Input id="block-name" className="mt-1.5" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="block-key" className="text-[12px] text-ink-muted">
              {t("key")}
            </Label>
            <Input
              id="block-key"
              className="mt-1.5 font-mono text-[12.5px]"
              value={effectiveKey}
              maxLength={60}
              onChange={(event) => {
                setKeyTouched(true);
                setKey(event.target.value.toLowerCase());
              }}
            />
            <p className={cn("mt-1 text-[11.5px]", effectiveKey && !keyValid ? "text-destructive" : "text-ink-subtle")}>
              {kind === "PARTIAL" ? t("keyHintBlock", { key: effectiveKey || "signature" }) : t("keyHintLayout")}
            </p>
          </div>
          <div>
            <Label htmlFor="block-description" className="text-[12px] text-ink-muted">
              {t("descriptionLabel")}
            </Label>
            <Input id="block-description" className="mt-1.5" value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon("editor.cancel")}
          </Button>
          <Button disabled={!name.trim() || !keyValid || create.isPending} onClick={() => void submit()}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A new block starts as a small, valid snippet: the server refuses an empty one. */
const STARTER_BLOCK = `<p style="margin:24px 0 0;color:#6b6b6b;font-size:13px;">— The WarpTalk team</p>`;

/** A new layout starts from a working shell rather than an empty box: `{{content}}` is required. */
const STARTER_LAYOUT = `<!doctype html>
<html>
  <body style="margin:0;background:#FBF9F5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">{{preheader}}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;">
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;">{{heading}}</h1>
                {{content}}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
