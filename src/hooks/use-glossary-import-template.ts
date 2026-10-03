"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  DEFAULT_IMPORT_TEMPLATE,
  baseLanguage,
  normalizeImportTemplateConfig,
  type ImportTemplateConfig,
} from "@/lib/glossary/import-template";
import { getLanguageByCode, languagesInScope } from "@/lib/language/languages";
import { GlossaryImportTemplateService } from "@/services/glossary-import-template.service";
import type { UpdateGlossaryImportTemplateRequest } from "@/types/glossary-import-template";

export const GLOSSARY_IMPORT_TEMPLATE_KEYS = {
  workspace: ["glossary-import-template", "workspace"] as const,
  admin: ["glossary-import-template", "admin"] as const,
  publishedLanguages: ["published-languages"] as const,
};

export interface ImportTemplateState {
  config: ImportTemplateConfig;
  isDefault: boolean;
  isLoading: boolean;
  /** The server could not be read; `config` is the built-in default. */
  isFallback: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

function toState(
  query: { data?: { isDefault: boolean; updatedAt?: string | null; updatedBy?: string | null } & Partial<ImportTemplateConfig>; isLoading: boolean; isError: boolean },
): ImportTemplateState {
  if (!query.data) {
    return {
      config: DEFAULT_IMPORT_TEMPLATE,
      isDefault: true,
      isLoading: query.isLoading,
      isFallback: query.isError,
    };
  }
  return {
    config: normalizeImportTemplateConfig(query.data),
    isDefault: query.data.isDefault,
    isLoading: false,
    isFallback: false,
    updatedAt: query.data.updatedAt,
    updatedBy: query.data.updatedBy,
  };
}

/**
 * The template for the workspace tab and the Import dialog. Never blocks a download: until the
 * server answers, or if it cannot, the built-in default (identical to the server's) is used.
 */
export function useGlossaryImportTemplate(): ImportTemplateState {
  const query = useQuery({
    queryKey: GLOSSARY_IMPORT_TEMPLATE_KEYS.workspace,
    queryFn: () => GlossaryImportTemplateService.get(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const { data, isLoading, isError } = query;
  return useMemo(() => toState({ data, isLoading, isError }), [data, isLoading, isError]);
}

export function useAdminGlossaryImportTemplate(enabled = true) {
  const query = useQuery({
    queryKey: GLOSSARY_IMPORT_TEMPLATE_KEYS.admin,
    queryFn: () => GlossaryImportTemplateService.getAdmin(),
    enabled,
  });
  return { ...toState(query), query };
}

function useInvalidateTemplate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["glossary-import-template"] });
}

export function useUpdateGlossaryImportTemplate() {
  const invalidate = useInvalidateTemplate();
  return useMutation({
    mutationFn: (request: UpdateGlossaryImportTemplateRequest) => GlossaryImportTemplateService.update(request),
    onSuccess: invalidate,
  });
}

export function useResetGlossaryImportTemplate() {
  const invalidate = useInvalidateTemplate();
  return useMutation({
    mutationFn: () => GlossaryImportTemplateService.reset(),
    onSuccess: invalidate,
  });
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
