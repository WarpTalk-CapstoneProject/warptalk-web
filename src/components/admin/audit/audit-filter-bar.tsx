"use client";

/**
 * The audit log's filters. Every one is applied by the server — this bar only writes the URL, and
 * the URL is what the query reads, so a copied link opens the same view.
 */

import { useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { Tooltip } from "@/components/ui/tooltip";
import {
  AUDIT_DATE_PRESETS,
  AUDIT_RESULTS,
  activeAuditFilterCount,
  auditActionLabel,
  auditEntityTypeLabel,
  type AuditFilters,
} from "@/lib/admin/audit-log";
import { isDateRangeInverted } from "@/lib/workspace/audit-log";
import { cn } from "@/lib/utils";
import type { AdminAuditLogFacets } from "@/types/admin-audit";

import { useAuditTranslator } from "./audit-bits";

const CONTROL =
  "h-9 rounded-lg border border-border bg-surface-1 px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20";

export function AuditFilterBar({
  filters,
  facets,
  workspaceName,
  trailing,
  onChange,
  onClear,
}: {
  filters: AuditFilters;
  facets: AdminAuditLogFacets | undefined;
  /** The name of the workspace filter, when one is set (it comes from an entry, not a control). */
  workspaceName: string | null;
  trailing: React.ReactNode;
  onChange: (next: Partial<AuditFilters>) => void;
  onClear: () => void;
}) {
  const t = useTranslations("adminMisc.audit.filters");
  const translate = useAuditTranslator();

  // The text inputs are drafts until submitted; back/forward can change the URL under them, so
  // they follow it during render rather than in an effect.
  const [searchDraft, setSearchDraft] = useState(filters.q);
  const [subjectDraft, setSubjectDraft] = useState(filters.entityId);
  const [applied, setApplied] = useState({ q: filters.q, entityId: filters.entityId });
  if (applied.q !== filters.q || applied.entityId !== filters.entityId) {
    setApplied({ q: filters.q, entityId: filters.entityId });
    setSearchDraft(filters.q);
    setSubjectDraft(filters.entityId);
  }

  const inverted = filters.preset === "custom" && isDateRangeInverted(filters.fromDate, filters.toDate);
  const activeCount = activeAuditFilterCount(filters);

  // A value in the URL that the store has never seen (a hand-edited link) still shows as chosen.
  const actionOptions = withSelected(facets?.actions.map((item) => item.value) ?? [], filters.action);
  const entityOptions = withSelected(facets?.entityTypes.map((item) => item.value) ?? [], filters.entityType);
  const actors = facets?.actors ?? [];
  const actorKnown = !filters.actorId || actors.some((actor) => actor.id === filters.actorId);

  return (
    <div className="border-b border-border py-3" role="search" aria-label={t("label")}>
      <FilterChipGroup label={t("rangeLabel")} trailing={trailing}>
        {AUDIT_DATE_PRESETS.map((preset) => (
          <FilterChip
            key={preset}
            selected={filters.preset === preset}
            onClick={() => onChange({ preset })}
            className="normal-case"
          >
            {t(`range.${preset}`)}
          </FilterChip>
        ))}
        {filters.preset === "custom" ? (
          <span className="flex shrink-0 items-center gap-1.5 pl-1">
            <label className="sr-only" htmlFor="audit-from">{t("from")}</label>
            <input
              id="audit-from"
              type="date"
              value={filters.fromDate}
              max={filters.toDate || undefined}
              onChange={(event) => onChange({ fromDate: event.target.value })}
              className={cn(CONTROL, "h-8 w-[150px]")}
              aria-invalid={inverted || undefined}
            />
            <span aria-hidden className="text-ink-subtle">–</span>
            <label className="sr-only" htmlFor="audit-to">{t("to")}</label>
            <input
              id="audit-to"
              type="date"
              value={filters.toDate}
              min={filters.fromDate || undefined}
              onChange={(event) => onChange({ toDate: event.target.value })}
              className={cn(CONTROL, "h-8 w-[150px]")}
              aria-invalid={inverted || undefined}
            />
          </span>
        ) : null}
      </FilterChipGroup>
      {inverted ? <p className="mt-2 text-[12px] text-destructive">{t("invertedRange")}</p> : null}

      <div className="mt-3 flex flex-col gap-2 xl:flex-row xl:items-center">
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onChange({ q: searchDraft.trim(), entityId: subjectDraft.trim() });
          }}
        >
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onBlur={() => searchDraft.trim() !== filters.q && onChange({ q: searchDraft.trim() })}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchAria")}
              maxLength={200}
              className={cn(CONTROL, "w-full pl-8")}
            />
          </div>
          <input
            type="text"
            value={subjectDraft}
            onChange={(event) => setSubjectDraft(event.target.value)}
            onBlur={() => subjectDraft.trim() !== filters.entityId && onChange({ entityId: subjectDraft.trim() })}
            placeholder={t("entityIdPlaceholder")}
            aria-label={t("entityIdAria")}
            maxLength={100}
            className={cn(CONTROL, "hidden w-[200px] font-mono text-[12px] md:block")}
          />
          <button type="submit" className="sr-only">{t("searchAria")}</button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filters.actorId}
            onChange={(event) => onChange({ actorId: event.target.value })}
            aria-label={t("actor")}
            className={cn(CONTROL, "max-w-[220px]")}
          >
            <option value="">{t("anyActor")}</option>
            {!actorKnown ? <option value={filters.actorId}>{filters.actorId.slice(0, 8)}…</option> : null}
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name ?? actor.email ?? `${actor.id.slice(0, 8)}…`}
                {actor.name && actor.email ? ` · ${actor.email}` : ""} ({actor.count})
              </option>
            ))}
          </select>

          <select
            value={filters.action}
            onChange={(event) => onChange({ action: event.target.value })}
            aria-label={t("action")}
            className={cn(CONTROL, "max-w-[220px]")}
          >
            <option value="">{t("anyAction")}</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>
                {auditActionLabel(action, translate)}
              </option>
            ))}
          </select>

          <select
            value={filters.entityType}
            onChange={(event) => onChange({ entityType: event.target.value })}
            aria-label={t("entity")}
            className={cn(CONTROL, "max-w-[180px]")}
          >
            <option value="">{t("anyEntity")}</option>
            {entityOptions.map((type) => (
              <option key={type} value={type}>
                {auditEntityTypeLabel(type, translate)}
              </option>
            ))}
          </select>

          <div role="radiogroup" aria-label={t("resultLabel")} className="flex h-9 items-center rounded-lg border border-border bg-surface-1 p-0.5">
            {AUDIT_RESULTS.map((result) => (
              <button
                key={result}
                type="button"
                role="radio"
                aria-checked={filters.result === result}
                onClick={() => onChange({ result })}
                className={cn(
                  "h-full rounded-md px-2.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  filters.result === result ? "bg-surface-2 font-medium text-ink" : "text-ink-muted hover:text-ink",
                  result === "failed" && filters.result === result && "text-destructive",
                )}
              >
                {t(`result.${result}`)}
              </button>
            ))}
          </div>

          {activeCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X size={13} />
              {t("clear")}
            </Button>
          ) : null}
        </div>
      </div>

      {filters.workspaceId ? (
        <div className="mt-2 flex">
          <Tooltip content={t("removeFilter")}>
            <button
              type="button"
              onClick={() => onChange({ workspaceId: "" })}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[12px] text-ink hover:bg-surface-3"
            >
              {t("workspaceChip", { name: workspaceName ?? `${filters.workspaceId.slice(0, 8)}…` })}
              <X size={11} />
            </button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}

function withSelected(values: string[], selected: string) {
  return selected && !values.includes(selected) ? [selected, ...values] : values;
}
