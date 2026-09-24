"use client";

/**
 * Email templates — every email the platform sends, where its words live, and what fills them in.
 *
 * Read-only, and that is the finding rather than a gap. The notification service has a
 * `notification_templates` table that looks like the backing store for an editor, but no sender
 * reads it: every email here is composed in code at send time. An editor over that table would
 * save and change nothing. See `src/lib/admin/email-catalog.ts` and the drift check beside it.
 */

import { useMemo, useState } from "react";
import { CaretDown, EnvelopeSimple, Info } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { EMAIL_CATALOG, type EmailCatalogEntry, type EmailStatus } from "@/lib/admin/email-catalog";
import { cn } from "@/lib/utils";

type Filter = "all" | EmailStatus;

function StatusPill({ status }: { status: EmailStatus }) {
  const t = useTranslations("adminMisc.emailTemplates");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        status === "live"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-hairline bg-surface-2 text-ink-muted",
      )}
    >
      {status === "live" ? t("statusLive") : t("statusDormant")}
    </span>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function EmailRow({ entry }: { entry: EmailCatalogEntry }) {
  const t = useTranslations("adminMisc.emailTemplates");
  const [open, setOpen] = useState(false);

  return (
    <li className="border-b border-hairline/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-surface-2/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-ink">{entry.name}</span>
            <StatusPill status={entry.status} />
          </div>
          <p className="mt-0.5 truncate text-[12px] text-ink-muted">{entry.subject}</p>
        </div>
        <span className="hidden shrink-0 text-[12px] text-ink-muted md:block">{entry.service}</span>
        <span className="hidden w-16 shrink-0 text-[12px] text-ink-muted md:block">{entry.provider}</span>
        <CaretDown
          size={14}
          className={cn("shrink-0 text-ink-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <dl className="space-y-3 border-t border-hairline/60 bg-surface-2/40 px-4 py-4">
          {entry.dormantReason ? (
            <Detail label={t("detail.whyDormant")}>{entry.dormantReason}</Detail>
          ) : null}
          <Detail label={t("detail.subject")}>{entry.subject}</Detail>
          <Detail label={t("detail.sentWhen")}>{entry.trigger}</Detail>
          <Detail label={t("detail.sentBy")}>
            {t("detail.sentByValue", { service: entry.service, provider: entry.provider })}
          </Detail>
          <Detail label={t("detail.body")}>{entry.bodySource}</Detail>
          <Detail label={t("detail.variables")}>
            <div className="flex flex-wrap gap-1.5">
              {entry.variables.map((variable) => (
                <code
                  key={variable}
                  className="rounded border border-hairline bg-surface-1 px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {variable}
                </code>
              ))}
            </div>
          </Detail>
          <Detail label={t("detail.source")}>
            <code className="break-all font-mono text-[12px] text-ink-muted">
              warptalk-backend/{entry.sourcePath}
            </code>
          </Detail>
        </dl>
      ) : null}
    </li>
  );
}

export default function AdminEmailTemplatesPage() {
  const t = useTranslations("adminMisc.emailTemplates");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(
    () => (filter === "all" ? EMAIL_CATALOG : EMAIL_CATALOG.filter((entry) => entry.status === filter)),
    [filter],
  );

  const tabs = useMemo(
    () => [
      { value: "all" as const, label: t("tabs.all") },
      { value: "live" as const, label: t("tabs.live") },
      { value: "dormant" as const, label: t("tabs.dormant") },
    ],
    [t],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<EnvelopeSimple size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
      />

      <div className="mt-5 flex items-start gap-3 rounded-lg border border-hairline bg-surface-1 px-4 py-3 shadow-linear">
        <Info size={16} weight="duotone" className="mt-0.5 shrink-0 text-ink-muted" />
        <p className="text-[13px] text-ink-muted">{t("notEditableNotice")}</p>
      </div>

      <AdminPanel className="mt-5">
        <div className="px-4">
          <AdminFilterTabs
            tabs={tabs}
            value={filter}
            onChange={setFilter}
            label={t("filterAria")}
            trailing={
              <span className="text-[12px] text-ink-muted">
                {t("emailCount", { count: rows.length })}
              </span>
            }
          />
        </div>
        <ul>
          {rows.map((entry) => (
            <EmailRow key={entry.key} entry={entry} />
          ))}
        </ul>
      </AdminPanel>
    </AdminPage>
  );
}
