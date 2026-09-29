"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  MagnifyingGlass,
  ArrowSquareOut,
  SlidersHorizontal,
  Info,
  Globe,
} from "@phosphor-icons/react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePublishedGlobalGlossaryTerms } from "@/hooks/use-workspace";
import type { GlobalGlossaryTermDto } from "@/types/global-glossary";
import {
  groupTermsByDomain,
  findCrossDomainTerms,
  normalizeDomain,
} from "@/lib/glossary/domain-grouping";
import { getLanguageName } from "@/lib/language/languages";

interface WorkspaceGlobalGlossaryViewProps {
  canManage: boolean;
  onCustomizeTerm?: (term: GlobalGlossaryTermDto) => void;
}

export function WorkspaceGlobalGlossaryView({
  canManage,
  onCustomizeTerm,
}: WorkspaceGlobalGlossaryViewProps) {
  const t = useTranslations("glossary");
  const { data: terms = [], isLoading, error } = usePublishedGlobalGlossaryTerms();

  const [search, setSearch] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"domain" | "alphabetical">("domain");

  // Adapt terms for domain-grouping utility
  const termsWithDomain = useMemo(() => {
    return terms.map((item) => ({
      ...item,
      domain: item.businessDomain ?? null,
    }));
  }, [terms]);

  // Compute multi-domain collisions so the reader sees "Also defined in: ..."
  const crossDomainMap = useMemo(() => {
    return findCrossDomainTerms(termsWithDomain, (t) => t.term);
  }, [termsWithDomain]);

  // Unique list of domains present in the published terms
  const availableDomains = useMemo(() => {
    const set = new Set<string>();
    for (const term of terms) {
      set.add(normalizeDomain(term.businessDomain));
    }
    return Array.from(set).sort((a, b) => {
      if (a === "General") return 1;
      if (b === "General") return -1;
      return a.localeCompare(b, "vi");
    });
  }, [terms]);

  // Filtered terms based on search & domain selector
  const filteredTerms = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return termsWithDomain.filter((term) => {
      if (selectedDomain !== "all" && normalizeDomain(term.domain) !== selectedDomain) {
        return false;
      }
      if (!needle) return true;
      return [
        term.term,
        term.preferredTranslation,
        term.domain,
        term.definition,
        term.usageNote,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle));
    });
  }, [termsWithDomain, search, selectedDomain]);

  // Group by Domain
  const domainGroups = useMemo(() => {
    return groupTermsByDomain(filteredTerms);
  }, [filteredTerms]);

  // Group by Alphabetical (A-Z)
  const alphabeticalGroups = useMemo(() => {
    const groups = new Map<string, typeof filteredTerms>();
    for (const term of filteredTerms) {
      const first = term.term.trim().charAt(0).toLocaleUpperCase("vi");
      const letter = /\p{Letter}/u.test(first) ? first : "#";
      const bucket = groups.get(letter);
      if (bucket) bucket.push(term);
      else groups.set(letter, [term]);
    }
    for (const bucket of groups.values()) {
      bucket.sort((a, b) => a.term.localeCompare(b.term, "vi"));
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b, "vi");
    });
  }, [filteredTerms]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 py-4">
        <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-64 animate-pulse rounded-lg bg-surface-2" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-hairline bg-surface-1 p-6 text-center text-ink-muted">
        <p className="text-[13px]">{t("globalView.loadError")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Notice Banner explaining Precedence & Private Policy */}
      <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-surface-2/60 px-3.5 py-2.5 text-[12px] text-ink-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
        <div className="flex-1 leading-relaxed">
          <span className="font-medium text-ink">{t("globalView.bannerTitle")}: </span>
          {t("globalView.bannerNotice")}
        </div>
      </div>

      {/* Toolbar: Search, Domain Filter Pills, and Group Toggle */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("globalView.searchPlaceholder")}
            className="h-8 pl-8 text-[12px]"
          />
        </div>

        {/* View Switcher: Group by Domain vs A-Z */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <span className="text-[11px] text-ink-subtle">{t("grouping.label")}:</span>
          <div className="inline-flex rounded-[6px] border border-hairline bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => setGroupBy("domain")}
              className={`rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
                groupBy === "domain"
                  ? "bg-surface-1 text-ink shadow-xs"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {t("grouping.byDomain")}
            </button>
            <button
              type="button"
              onClick={() => setGroupBy("alphabetical")}
              className={`rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
                groupBy === "alphabetical"
                  ? "bg-surface-1 text-ink shadow-xs"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {t("grouping.alphabetical")}
            </button>
          </div>
        </div>
      </div>

      {/* Domain Jump Navigation (Linear style pills) */}
      {availableDomains.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedDomain("all")}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              selectedDomain === "all"
                ? "border-border bg-surface-3 font-semibold text-ink"
                : "border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {t("domains.all")}
            <span className="text-[10px] text-ink-subtle">({terms.length})</span>
          </button>
          {availableDomains.map((domain) => {
            const domainCount = termsWithDomain.filter(
              (t) => normalizeDomain(t.domain) === domain,
            ).length;
            const active = selectedDomain === domain;
            return (
              <button
                key={domain}
                type="button"
                onClick={() => setSelectedDomain(domain)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  active
                    ? "border-border bg-surface-3 font-semibold text-ink"
                    : "border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {domain}
                <span className="text-[10px] text-ink-subtle">({domainCount})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Terms Listing: Structured by Sections */}
      {filteredTerms.length === 0 ? (
        <div className="rounded-lg border border-hairline bg-surface-1 py-12 text-center">
          <Globe className="mx-auto h-8 w-8 text-ink-subtle opacity-40" />
          <p className="mt-2 text-[13px] font-medium text-ink">{t("globalView.emptyTitle")}</p>
          <p className="mt-1 text-[12px] text-ink-muted">{t("globalView.emptyDescription")}</p>
        </div>
      ) : groupBy === "domain" ? (
        <div className="flex flex-col gap-4">
          {domainGroups.map((group) => (
            <div key={group.domain} className="overflow-clip rounded-lg border border-hairline">
              {/* Section Header: Domain Title & Count */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <span className="flex items-center gap-1.5">
                  {group.domain}
                  <span className="font-normal normal-case text-ink-subtle">
                    ({group.count} {t("termsCount")})
                  </span>
                </span>
              </div>

              {/* Term Rows inside this Domain */}
              <ul className="divide-y divide-hairline bg-surface-1">
                {group.terms.map((term) => {
                  const otherDomains = crossDomainMap.get(term);
                  return (
                    <li
                      key={term.id}
                      className="group flex flex-col gap-2 p-3 transition-colors hover:bg-surface-2/40 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex flex-1 flex-col gap-1">
                        {/* Word & Target Translation */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink">{term.term}</span>
                          <span className="text-ink-subtle">→</span>
                          <span className="text-[13px] font-medium text-ink">
                            {term.preferredTranslation}
                          </span>

                          {/* Language Pair Pill */}
                          {(term.sourceLanguage || term.targetLanguage) && (
                            <span className="rounded-[4px] border border-hairline bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted">
                              {getLanguageName(term.sourceLanguage ?? "en")} →{" "}
                              {getLanguageName(term.targetLanguage ?? "vi")}
                            </span>
                          )}

                          {/* Priority badge if elevated */}
                          {term.priority > 0 && (
                            <span className="rounded-[4px] border border-hairline px-1.5 py-0.5 text-[10px] text-ink-subtle">
                              {t("priorityLabel")}: {term.priority}
                            </span>
                          )}
                        </div>

                        {/* Definition in this domain */}
                        {term.definition && (
                          <p className="text-[12px] leading-relaxed text-ink-muted">
                            {term.definition}
                          </p>
                        )}

                        {/* Context Sentence in this domain */}
                        {term.usageNote && (
                          <div className="flex items-baseline gap-1 text-[11px] text-ink-subtle">
                            <span className="font-medium text-ink-muted">
                              {t("contextLabel")}:
                            </span>
                            <span className="italic">"{term.usageNote}"</span>
                          </div>
                        )}

                        {/* Cross-Domain Link / Ambiguity marker */}
                        {otherDomains && otherDomains.length > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-subtle">
                            <span>{t("multiDomainNotice")}:</span>
                            {otherDomains.map((od) => (
                              <button
                                key={od}
                                type="button"
                                onClick={() => setSelectedDomain(od)}
                                className="underline hover:text-ink"
                              >
                                {od}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action: Customize for Workspace */}
                      {canManage && onCustomizeTerm && (
                        <div className="mt-2 shrink-0 sm:mt-0">
                          <button
                            type="button"
                            onClick={() => onCustomizeTerm(term)}
                            className="inline-flex items-center gap-1 rounded-[5px] border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-surface-3"
                          >
                            <ArrowSquareOut className="h-3 w-3" />
                            {t("globalView.customizeAction")}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        /* Alphabetical Grouping View */
        <div className="overflow-clip rounded-lg border border-hairline">
          {alphabeticalGroups.map(([letter, letterTerms]) => (
            <section key={letter}>
              <h3 className="sticky top-0 z-10 border-b border-hairline bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {letter}
                <span className="ml-1.5 font-normal normal-case text-ink-subtle">
                  ({letterTerms.length})
                </span>
              </h3>
              <ul className="divide-y divide-hairline bg-surface-1">
                {letterTerms.map((term) => {
                  const otherDomains = crossDomainMap.get(term);
                  return (
                    <li
                      key={term.id}
                      className="group flex flex-col gap-2 p-3 transition-colors hover:bg-surface-2/40 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink">{term.term}</span>
                          <span className="text-ink-subtle">→</span>
                          <span className="text-[13px] font-medium text-ink">
                            {term.preferredTranslation}
                          </span>
                          <span className="rounded-[4px] border border-hairline bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted">
                            {normalizeDomain(term.domain)}
                          </span>
                        </div>
                        {term.definition && (
                          <p className="text-[12px] leading-relaxed text-ink-muted">
                            {term.definition}
                          </p>
                        )}
                        {term.usageNote && (
                          <p className="text-[11px] italic text-ink-subtle">
                            "{term.usageNote}"
                          </p>
                        )}
                        {otherDomains && otherDomains.length > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-subtle">
                            <span>{t("multiDomainNotice")}:</span>
                            {otherDomains.map((od) => (
                              <button
                                key={od}
                                type="button"
                                onClick={() => setSelectedDomain(od)}
                                className="underline hover:text-ink"
                              >
                                {od}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {canManage && onCustomizeTerm && (
                        <div className="mt-2 shrink-0 sm:mt-0">
                          <button
                            type="button"
                            onClick={() => onCustomizeTerm(term)}
                            className="inline-flex items-center gap-1 rounded-[5px] border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-surface-3"
                          >
                            <ArrowSquareOut className="h-3 w-3" />
                            {t("globalView.customizeAction")}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
