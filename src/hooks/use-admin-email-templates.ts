"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminEmailTemplateService } from "@/services/admin-email-template.service";
import type { EmailTemplateContentDto, SaveEmailTemplateRequest } from "@/types/admin-cms";

export const ADMIN_EMAIL_TEMPLATE_KEYS = {
  all: ["admin-email-templates"] as const,
  list: ["admin-email-templates", "list"] as const,
  detail: (key: string) => ["admin-email-templates", "detail", key] as const,
  versions: (key: string) => ["admin-email-templates", "versions", key] as const,
  preview: (key: string, draft: EmailTemplateContentDto) =>
    ["admin-email-templates", "preview", key, draft] as const,
};

export function useAdminEmailTemplates() {
  return useQuery({
    queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.list,
    queryFn: () => adminEmailTemplateService.list(),
    staleTime: 30_000,
  });
}

export function useAdminEmailTemplate(key: string | undefined) {
  return useQuery({
    queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.detail(key ?? ""),
    queryFn: () => adminEmailTemplateService.get(key!),
    enabled: Boolean(key),
    staleTime: 10_000,
  });
}

export function useAdminEmailTemplateVersions(key: string | undefined) {
  return useQuery({
    queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.versions(key ?? ""),
    queryFn: () => adminEmailTemplateService.versions(key!),
    enabled: Boolean(key),
    staleTime: 10_000,
  });
}

/**
 * The server-rendered preview of an unsaved draft — the same renderer the senders use, so the
 * frame shows exactly what a recipient would get. The caller debounces the draft it passes.
 */
export function useEmailTemplatePreview(key: string | undefined, draft: EmailTemplateContentDto | null) {
  return useQuery({
    queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.preview(key ?? "", draft ?? { subject: "", heading: "", bodyHtml: "" }),
    queryFn: () => adminEmailTemplateService.preview(key!, draft!),
    enabled: Boolean(key && draft),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

function useInvalidateTemplate() {
  const queryClient = useQueryClient();
  return (key: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.list }),
      queryClient.invalidateQueries({ queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.detail(key) }),
      queryClient.invalidateQueries({ queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.versions(key) }),
    ]);
}

export function useSaveEmailTemplate() {
  const invalidate = useInvalidateTemplate();
  return useMutation({
    mutationFn: ({ key, request }: { key: string; request: SaveEmailTemplateRequest }) =>
      adminEmailTemplateService.save(key, request),
    onSuccess: (_data, { key }) => invalidate(key),
  });
}

export function useResetEmailTemplate() {
  const invalidate = useInvalidateTemplate();
  return useMutation({
    mutationFn: (key: string) => adminEmailTemplateService.reset(key),
    onSuccess: (_data, key) => invalidate(key),
  });
}

export function useRestoreEmailTemplateVersion() {
  const invalidate = useInvalidateTemplate();
  return useMutation({
    mutationFn: ({ key, version }: { key: string; version: number }) =>
      adminEmailTemplateService.restore(key, version),
    onSuccess: (_data, { key }) => invalidate(key),
  });
}

/** Sends the draft, filled with sample values, to the signed-in admin. Saves nothing. */
export function useSendTestEmail() {
  return useMutation({
    mutationFn: ({ key, draft }: { key: string; draft: EmailTemplateContentDto }) =>
      adminEmailTemplateService.sendTest(key, draft),
  });
}
