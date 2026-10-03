"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  DEFAULT_IMPORT_TEMPLATE,
  baseLanguage,
  type ImportTemplateConfig,
} from "@/lib/glossary/import-template";
import { getLanguageByCode, languagesInScope } from "@/lib/language/languages";
import { GlossaryImportTemplateService } from "@/services/glossary-import-template.service";

export const GLOSSARY_IMPORT_TEMPLATE_KEYS = {
  publishedLanguages: ["published-languages"] as const,
};

export interface ImportTemplateState {
  config: ImportTemplateConfig;
}

const FIXED_TEMPLATE: ImportTemplateState = { config: DEFAULT_IMPORT_TEMPLATE };

/**
 * The template for the workspace tab and the Import dialog.
 *
 * WT-880 option B (PO 2026-10-02): the import file shape is a fixed default the web owns - it
 * generates the file and parses it on import - so there is nothing to fetch. The backend removed
 * the table and both endpoints with that decision (warptalk-backend 268bedf7); this hook kept
 * asking for them, so every visit made a failing request, the workspace tab showed its amber
 * "could not load, using the default" notice, and the admin tab could not load at all (3 Oct 2026).
 */
export function useGlossaryImportTemplate(): ImportTemplateState {
  return FIXED_TEMPLATE;
}

export interface TemplateLanguageOption {
  code: string;
  name: string;
}

/**
 * The languages a template can be built for: every language the platform admin has published
 * (PO decision 2026-10-02) — NOT the workspace's language policy. Codes are reduced to their base
 * language (the glossary is keyed by bare ISO-639) and named from the registry when it knows them.
 *
 * If the list cannot be read, the registry's glossary languages stand in, so the tab still works.
 */
export function usePublishedTemplateLanguages(): {
  languages: TemplateLanguageOption[];
  isLoading: boolean;
  isFallback: boolean;
} {
  const query = useQuery({
    queryKey: GLOSSARY_IMPORT_TEMPLATE_KEYS.publishedLanguages,
    queryFn: () => GlossaryImportTemplateService.getPublishedLanguages(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return useMemo(() => {
    const fallback = !query.data;
    const source = query.data
      ? query.data.filter((language) => language.isActive !== false).map((language) => ({ code: language.code, name: language.name }))
      : languagesInScope("glossary").map((language) => ({ code: language.code, name: language.name }));

    const seen = new Map<string, TemplateLanguageOption>();
    for (const language of source) {
      const code = baseLanguage(language.code);
      if (!code || seen.has(code)) continue;
      seen.set(code, { code, name: getLanguageByCode(code)?.name ?? language.name ?? code });
    }
    return {
      languages: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
      isLoading: query.isLoading,
      isFallback: fallback && query.isError,
    };
  }, [query.data, query.isLoading, query.isError]);
}
