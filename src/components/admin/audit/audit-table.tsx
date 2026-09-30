"use client";

/**
 * The log as a table: when, what, who, on what, why — and whether it took. A row opens the detail
 * drawer; the subject and its workspace are links of their own.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  auditChangeSummary,
  auditEntityHref,
  auditEntityTypeLabel,
  auditSourceLabel,
  auditWorkspaceHref,
} from "@/lib/admin/audit-log";
import { cn } from "@/lib/utils";
import type { AdminAuditLogEntryDto } from "@/types/admin-audit";

import { AuditActionPill, AuditResultBadge, AuditWhen, useAuditTranslator } from "./audit-bits";

export function AuditTable({
  entries,
  selectedId,
  onOpen,
}: {
  entries: AdminAuditLogEntryDto[];
  selectedId: string | null;
  onOpen: (entry: AdminAuditLogEntryDto) => void;
}) {
  const t = useTranslations("adminMisc.audit.table");

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] table-fixed border-collapse text-left">
        <caption className="sr-only">{t("caption")}</caption>
        <colgroup>
          <col className="w-[120px]" />
          <col className="w-[210px]" />
          <col className="w-[190px]" />
          <col className="w-[220px]" />
          <col />
          <col className="w-[110px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-hairline/80 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            <th scope="col" className="px-4 py-2.5 font-semibold">{t("when")}</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">{t("action")}</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">{t("actor")}</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">{t("subject")}</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">{t("reason")}</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t("result")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} selected={entry.id === selectedId} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditRow({
  entry,
  selected,
  onOpen,
}: {
  entry: AdminAuditLogEntryDto;
  selected: boolean;
  onOpen: (entry: AdminAuditLogEntryDto) => void;
}) {
  const t = useTranslations("adminMisc.audit");
  const translate = useAuditTranslator();
  const subjectHref = auditEntityHref(entry.entity, entry.beforeSummary, entry.afterSummary);
  const workspaceHref = auditWorkspaceHref(entry.entity);
  const change = auditChangeSummary(entry.beforeSummary, entry.afterSummary);
  const failed = entry.result !== "succeeded";

  return (
    // The row is a click target for the pointer; the time is the button a keyboard reaches, so
    // the links inside the row stay links rather than nesting inside another control.
    <tr
      onClick={() => onOpen(entry)}
      className={cn(
        "cursor-pointer border-b border-hairline/60 align-top transition-colors last:border-b-0 hover:bg-surface-2/60",
        selected && "bg-surface-2",
        failed && "bg-destructive/[0.03]",
      )}
    >
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(entry);
          }}
          aria-label={t("table.open")}
          className="rounded text-left text-[12px] text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <AuditWhen value={entry.performedAt} />
        </button>
      </td>

      <td className="px-3 py-3">
        <AuditActionPill action={entry.action} />
        <p className="mt-1 truncate text-[11px] text-ink-subtle">{auditSourceLabel(entry.sourceService, translate)}</p>
      </td>

      <td className="px-3 py-3">
        <p className={cn("truncate text-[13px]", entry.actor.name ? "font-medium text-ink" : "italic text-ink-subtle")}>
          {entry.actor.name ?? (entry.actor.email ? entry.actor.email : t("actorUnknown"))}
        </p>
        {entry.actor.name && entry.actor.email ? (
          <p className="truncate text-[11px] text-ink-subtle">{entry.actor.email}</p>
        ) : !entry.actor.name && !entry.actor.email ? (
          <p className="truncate font-mono text-[11px] text-ink-subtle">{entry.actor.id.slice(0, 8)}…</p>
        ) : null}
      </td>

      <td className="px-3 py-3">
        <p className="truncate text-[11px] text-ink-subtle">{auditEntityTypeLabel(entry.entity.type, translate)}</p>
        <SubjectName entry={entry} href={subjectHref} />
        {workspaceHref && entry.entity.workspaceName ? (
          <Link
            href={workspaceHref}
            onClick={(event) => event.stopPropagation()}
            className="block truncate text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            {t("table.inWorkspace", { name: entry.entity.workspaceName })}
          </Link>
        ) : null}
      </td>

      <td className="px-3 py-3">
        {/* Reason is a first-class column, not a tooltip: an audit table that hides the why is
            worth about as much as none. */}
        <p className={cn("line-clamp-2 break-words text-[13px]", entry.reason ? "text-ink" : "italic text-ink-subtle")}>
          {entry.reason ?? t("noReason")}
        </p>
        {failed && entry.errorMessage ? (
          <p className="mt-1 line-clamp-1 break-words text-[12px] text-destructive">{entry.errorMessage}</p>
        ) : change ? (
          <p className="mt-1 truncate font-mono text-[11px] text-ink-subtle">{change}</p>
        ) : null}
      </td>

      <td className="px-4 py-3 text-right">
        <AuditResultBadge result={entry.result} />
      </td>
    </tr>
  );
}

function SubjectName({ entry, href }: { entry: AdminAuditLogEntryDto; href: string | null }) {
  const name = entry.entity.label ?? entry.entity.key ?? (entry.entity.id ? `${entry.entity.id.slice(0, 8)}…` : null);
  if (!name) return <p className="text-[13px] text-ink-subtle">—</p>;

  const mono = !entry.entity.label;
  if (!href) {
    return <p className={cn("truncate text-[13px] text-ink", mono && "font-mono text-[12px]")}>{name}</p>;
  }

  return (
    <Link
      href={href}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "block truncate text-[13px] font-medium text-primary underline-offset-2 hover:underline",
        mono && "font-mono text-[12px]",
      )}
    >
      {name}
    </Link>
  );
}
