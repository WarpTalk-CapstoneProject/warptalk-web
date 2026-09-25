"use client";

/**
 * One audit entry in full: who, to what, why, what changed field by field, how it ended, and the
 * request it came from. Every id is copyable; the subject and the admin each open their own
 * filtered view of the log.
 */

import Link from "next/link";
import { ArrowSquareOut, FunnelSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  auditActionLabel,
  auditDiffRows,
  auditEntityHref,
  auditEntityTypeLabel,
  auditFieldLabel,
  auditSourceLabel,
  auditWorkspaceHref,
} from "@/lib/admin/audit-log";
import { cn } from "@/lib/utils";
import type { AdminAuditLogEntryDto } from "@/types/admin-audit";

import {
  AuditActionPill,
  AuditResultBadge,
  CopyValue,
  formatAuditAbsolute,
  useAuditTranslator,
} from "./audit-bits";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-hairline px-5 py-4 last:border-b-0">
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 py-1 text-[13px]">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

export function AuditDetailDrawer({
  entry,
  isLoading,
  isError,
  onClose,
  onFilterSubject,
  onFilterActor,
}: {
  entry: AdminAuditLogEntryDto | null;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
  onFilterSubject: (entry: AdminAuditLogEntryDto) => void;
  onFilterActor: (entry: AdminAuditLogEntryDto) => void;
}) {
  const t = useTranslations("adminMisc.audit.detail");
  const tAudit = useTranslations("adminMisc.audit");
  const translate = useAuditTranslator();
  const locale = useLocale();

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[600px]">
        {entry ? (
          <>
            <SheetHeader className="border-b border-hairline px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <AuditActionPill action={entry.action} />
                <AuditResultBadge result={entry.result} />
              </div>
              <SheetTitle className="mt-2 text-[16px]">
                {auditActionLabel(entry.action, translate)}
                {entry.entity.label ? <span className="text-ink-muted"> · {entry.entity.label}</span> : null}
              </SheetTitle>
              <SheetDescription className="text-[12px]">
                {formatAuditAbsolute(entry.performedAt, locale)} · {auditSourceLabel(entry.sourceService, translate)}
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              {entry.result !== "succeeded" ? (
                <div className="flex items-start gap-2.5 border-b border-destructive/20 bg-destructive/5 px-5 py-3.5 text-[13px]">
                  <WarningCircle size={17} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
                  <div className="min-w-0">
                    <p className="font-medium text-destructive">{t("error")}</p>
                    <p className="mt-0.5 break-words text-ink">{entry.errorMessage ?? t("notRecorded")}</p>
                  </div>
                </div>
              ) : null}

              <Section title={t("reason")}>
                {entry.reason ? (
                  <p className="whitespace-pre-wrap break-words text-[13px] text-ink">{entry.reason}</p>
                ) : (
                  <p className="text-[13px] italic text-ink-subtle">{tAudit("noReason")}</p>
                )}
              </Section>

              <Section title={t("change")}>
                <AuditDiff entry={entry} />
              </Section>

              <Section title={t("actor")}>
                <dl>
                  <Field label={t("actor")}>
                    <span className="font-medium">{entry.actor.name ?? tAudit("actorUnknown")}</span>
                    {entry.actor.email ? <span className="ml-1.5 text-ink-muted">{entry.actor.email}</span> : null}
                  </Field>
                  <Field label="ID">
                    <CopyValue value={entry.actor.id} />
                  </Field>
                </dl>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => onFilterActor(entry)}>
                    <FunnelSimple size={13} />
                    {t("filterActor")}
                  </Button>
                  <Link href={`/admin/users/${entry.actor.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    <ArrowSquareOut size={13} />
                    {t("openSubject")}
                  </Link>
                </div>
              </Section>

              <Section title={t("subject")}>
                <SubjectFields entry={entry} onFilterSubject={onFilterSubject} />
              </Section>

              <Section title={t("request")}>
                <dl>
                  <Field label={t("requestId")}>
                    {entry.request.correlationId ? (
                      <CopyValue value={entry.request.correlationId} />
                    ) : (
                      <NotRecorded />
                    )}
                  </Field>
                  <Field label={t("ipAddress")}>
                    {entry.request.ipAddress ? <CopyValue value={entry.request.ipAddress} /> : <NotRecorded />}
                  </Field>
                  <Field label={t("userAgent")}>
                    {entry.request.userAgent ? (
                      <span className="break-words text-[12px] text-ink-muted">{entry.request.userAgent}</span>
                    ) : (
                      <NotRecorded />
                    )}
                  </Field>
                  <Field label={t("source")}>
                    <span>{auditSourceLabel(entry.sourceService, translate)}</span>
                    <code className="ml-1.5 font-mono text-[11px] text-ink-subtle">{entry.sourceService}</code>
                  </Field>
                  <Field label={t("entryId")}>
                    <CopyValue value={entry.id} />
                  </Field>
                </dl>
                {!entry.request.ipAddress && !entry.request.userAgent ? (
                  <p className="mt-2 text-[11px] text-ink-subtle">{t("notRecordedHint")}</p>
                ) : null}
              </Section>
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="border-b border-hairline px-5 py-4">
              <SheetTitle className="text-[16px]">{t("title")}</SheetTitle>
              <SheetDescription className="text-[12px]">
                {isError ? t("loadError") : isLoading ? tAudit("loading") : t("loadError")}
              </SheetDescription>
            </SheetHeader>
            {isLoading ? (
              <div className="space-y-3 px-5 py-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-3 w-full animate-pulse rounded bg-surface-2" />
                ))}
              </div>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NotRecorded() {
  const t = useTranslations("adminMisc.audit.detail");
  return <span className="text-[12px] italic text-ink-subtle">{t("notRecorded")}</span>;
}

function SubjectFields({
  entry,
  onFilterSubject,
}: {
  entry: AdminAuditLogEntryDto;
  onFilterSubject: (entry: AdminAuditLogEntryDto) => void;
}) {
  const t = useTranslations("adminMisc.audit.detail");
  const translate = useAuditTranslator();
  const href = auditEntityHref(entry.entity, entry.beforeSummary, entry.afterSummary);
  const workspaceHref = auditWorkspaceHref(entry.entity);
  const subjectRef = entry.entity.id ?? entry.entity.key;

  return (
    <>
      <dl>
        <Field label={t("subject")}>
          <span className="text-ink-muted">{auditEntityTypeLabel(entry.entity.type, translate)}</span>
          {entry.entity.label ? (
            href ? (
              <Link href={href} className="ml-1.5 font-medium text-primary underline-offset-2 hover:underline">
                {entry.entity.label}
              </Link>
            ) : (
              <span className="ml-1.5 font-medium">{entry.entity.label}</span>
            )
          ) : null}
        </Field>
        {subjectRef ? (
          <Field label="ID">
            <CopyValue value={subjectRef} />
          </Field>
        ) : null}
        {entry.entity.workspaceId && entry.entity.type !== "workspace" ? (
          <Field label={t("workspace")}>
            {workspaceHref ? (
              <Link href={workspaceHref} className="font-medium text-primary underline-offset-2 hover:underline">
                {entry.entity.workspaceName ?? entry.entity.workspaceId}
              </Link>
            ) : (
              entry.entity.workspaceName ?? entry.entity.workspaceId
            )}
          </Field>
        ) : null}
      </dl>
      <div className="mt-2 flex flex-wrap gap-2">
        {subjectRef ? (
          <Button variant="outline" size="sm" onClick={() => onFilterSubject(entry)}>
            <FunnelSimple size={13} />
            {t("filterSubject")}
          </Button>
        ) : null}
        {href ? (
          <Link href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowSquareOut size={13} />
            {t("openSubject")}
          </Link>
        ) : null}
      </div>
    </>
  );
}

function AuditDiff({ entry }: { entry: AdminAuditLogEntryDto }) {
  const t = useTranslations("adminMisc.audit.detail");
  const rows = auditDiffRows(entry.beforeSummary, entry.afterSummary);

  if (rows.length === 0) {
    return <p className="text-[13px] text-ink-subtle">{t("noChange")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-hairline">
      <table className="w-full table-fixed text-[12px]">
        <thead className="bg-surface-2 text-left text-[11px] text-ink-subtle">
          <tr>
            <th scope="col" className="w-[34%] px-3 py-1.5 font-medium">{t("field")}</th>
            <th scope="col" className="w-[33%] px-3 py-1.5 font-medium">{t("before")}</th>
            <th scope="col" className="w-[33%] px-3 py-1.5 font-medium">{t("after")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-hairline/70 align-top">
              <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink-muted">
                <span className="block truncate">{auditFieldLabel(row.key)}</span>
                <span className="block truncate font-mono text-[10px] text-ink-subtle">{row.key}</span>
              </th>
              <td
                className={cn(
                  "break-words px-3 py-1.5 font-mono",
                  row.change === "changed" || row.change === "removed"
                    ? "bg-destructive/5 text-ink-muted line-through decoration-destructive/40"
                    : "text-ink-muted",
                )}
              >
                {row.before ?? "—"}
              </td>
              <td
                className={cn(
                  "break-words px-3 py-1.5 font-mono",
                  row.change === "changed" || row.change === "added"
                    ? "bg-emerald-500/5 text-ink"
                    : "text-ink-muted",
                )}
              >
                {row.after ?? "—"}
                <span className="sr-only"> ({t(`changeKind.${row.change}`)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
