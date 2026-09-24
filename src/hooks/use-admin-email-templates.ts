"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CMS_AUDIT_KEYS } from "@/hooks/use-cms-audit";

import { adminEmailTemplateService } from "@/services/admin-email-template.service";
import type {
  EmailBulkRequest,
  EmailPreviewRequest,
  EmailTestSendRequest,
  PublishEmailRequest,
  SaveEmailDraftRequest,
  SaveSampleDataSetRequest,
} from "@/types/admin-cms";

export const ADMIN_EMAIL_TEMPLATE_KEYS = {
  all: ["admin-email-templates"] as const,
  list: ["admin-email-templates", "list"] as const,
  detail: (key: string) => ["admin-email-templates", "detail", key] as const,
  versions: (key: string, locale: string) => ["admin-email-templates", "versions", key, locale] as const,
  stats: (key: string, days: number) => ["admin-email-templates", "stats", key, days] as const,
  preview: (key: string, request: EmailPreviewRequest) => ["admin-email-templates", "preview", key, request] as const,
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

export function useEmailTemplateVersions(key: string | undefined, locale: string) {
  return useQuery({
    queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.versions(key ?? "", locale),
    queryFn: () => adminEmailTemplateService.versions(key!, locale),
    enabled: Boolean(key),
    staleTime: 10_000,
  });
}

export function useEmailTemplateStats(key: string | undefined, days: number) {
  return useQuery({
    queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.stats(key ?? "", days),
    queryFn: () => adminEmailTemplateService.stats(key!, days),
    enabled: Boolean(key),
    staleTime: 60_000,
  });
}

/**
 * The server-rendered preview of an unsaved draft — the same renderer the senders use, so the
 * frame shows exactly what a recipient would get. The caller debounces what it passes.
 */
export function useEmailTemplatePreview(key: string | undefined, request: EmailPreviewRequest | null) {
  return useQuery({
    queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.preview(key ?? "", request as EmailPreviewRequest),
    queryFn: () => adminEmailTemplateService.preview(key!, request!),
    enabled: Boolean(key && request),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Every write refreshes the whole email CMS cache: lists, details, versions and stats all move. */
function useEmailMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: CMS_AUDIT_KEYS.all }),
      ]),
  });
}

export function useSaveEmailDraft() {
  return useEmailMutation(({ key, locale, request }: { key: string; locale: string; request: SaveEmailDraftRequest }) =>
    adminEmailTemplateService.saveDraft(key, locale, request),
  );
}

export function usePublishEmail() {
  return useEmailMutation(({ key, locale, request }: { key: string; locale: string; request: PublishEmailRequest }) =>
    adminEmailTemplateService.publish(key, locale, request),
  );
}

export function useDiscardEmailDraft() {
  return useEmailMutation(({ key, locale }: { key: string; locale: string }) => adminEmailTemplateService.discardDraft(key, locale));
}

export function useArchiveEmail() {
  return useEmailMutation(({ key, locale }: { key: string; locale: string }) => adminEmailTemplateService.archive(key, locale));
}

export function useUnarchiveEmail() {
  return useEmailMutation(({ key, locale }: { key: string; locale: string }) => adminEmailTemplateService.unarchive(key, locale));
}

export function useDuplicateEmail() {
  return useEmailMutation(
    ({ key, locale, targetLocale, overwrite }: { key: string; locale: string; targetLocale: string; overwrite: boolean }) =>
      adminEmailTemplateService.duplicate(key, locale, targetLocale, overwrite),
  );
}

export function useResetEmailToDefault() {
  return useEmailMutation(({ key, locale }: { key: string; locale: string }) =>
    adminEmailTemplateService.resetToDefault(key, locale),
  );
}

export function useRestoreEmailVersion() {
  return useEmailMutation(({ key, locale, version }: { key: string; locale: string; version: number }) =>
    adminEmailTemplateService.restore(key, locale, version),
  );
}

export function useSaveSampleSet() {
  return useEmailMutation(({ key, id, request }: { key: string; id: string | null; request: SaveSampleDataSetRequest }) =>
    adminEmailTemplateService.saveSampleSet(key, id, request),
  );
}

export function useDeleteSampleSet() {
  return useEmailMutation(({ key, id }: { key: string; id: string }) => adminEmailTemplateService.deleteSampleSet(key, id));
}

export function useEmailBulk() {
  return useEmailMutation((request: EmailBulkRequest) => adminEmailTemplateService.bulk(request));
}

/** Sends a draft, filled with sample values, to the given addresses. Saves nothing. */
export function useSendTestEmail() {
  return useMutation({
    mutationFn: ({ key, request }: { key: string; request: EmailTestSendRequest }) =>
      adminEmailTemplateService.sendTest(key, request),
  });
}
