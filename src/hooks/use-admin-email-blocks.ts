"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CMS_AUDIT_KEYS } from "@/hooks/use-cms-audit";

import { adminEmailBlockService } from "@/services/admin-email-block.service";
import type {
  CreateEmailBlockRequest,
  EmailBlockBulkAction,
  EmailBlockKind,
  EmailBlockPreviewRequest,
  PublishEmailRequest,
  SaveEmailBlockDraftRequest,
} from "@/types/admin-cms";

import { ADMIN_EMAIL_TEMPLATE_KEYS } from "@/hooks/use-admin-email-templates";

export const ADMIN_EMAIL_BLOCK_KEYS = {
  all: ["admin-email-blocks"] as const,
  list: (kind?: EmailBlockKind) => ["admin-email-blocks", "list", kind ?? "all"] as const,
  detail: (id: string) => ["admin-email-blocks", "detail", id] as const,
  versions: (id: string) => ["admin-email-blocks", "versions", id] as const,
  preview: (kind: EmailBlockKind, request: EmailBlockPreviewRequest) => ["admin-email-blocks", "preview", kind, request] as const,
};

export function useEmailBlocks(kind?: EmailBlockKind) {
  return useQuery({
    queryKey: ADMIN_EMAIL_BLOCK_KEYS.list(kind),
    queryFn: () => adminEmailBlockService.list(kind),
    staleTime: 30_000,
  });
}

export function useEmailBlock(id: string | undefined) {
  return useQuery({
    queryKey: ADMIN_EMAIL_BLOCK_KEYS.detail(id ?? ""),
    queryFn: () => adminEmailBlockService.get(id!),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useEmailBlockVersions(id: string | undefined) {
  return useQuery({
    queryKey: ADMIN_EMAIL_BLOCK_KEYS.versions(id ?? ""),
    queryFn: () => adminEmailBlockService.versions(id!),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useEmailBlockPreview(kind: EmailBlockKind, request: EmailBlockPreviewRequest | null) {
  return useQuery({
    queryKey: ADMIN_EMAIL_BLOCK_KEYS.preview(kind, request as EmailBlockPreviewRequest),
    queryFn: () => adminEmailBlockService.preview(kind, request!),
    enabled: Boolean(request),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** A block write also invalidates the email caches: a layout's name and usage show on the emails. */
function useBlockMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_EMAIL_BLOCK_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: ["email-render"] }),
        queryClient.invalidateQueries({ queryKey: CMS_AUDIT_KEYS.all }),
      ]),
  });
}

export function useCreateEmailBlock() {
  return useBlockMutation((request: CreateEmailBlockRequest) => adminEmailBlockService.create(request));
}

export function useSaveEmailBlockDraft() {
  return useBlockMutation(({ id, request }: { id: string; request: SaveEmailBlockDraftRequest }) =>
    adminEmailBlockService.saveDraft(id, request),
  );
}

export function usePublishEmailBlock() {
  return useBlockMutation(({ id, request }: { id: string; request: PublishEmailRequest }) =>
    adminEmailBlockService.publish(id, request),
  );
}

export function useDiscardEmailBlockDraft() {
  return useBlockMutation((id: string) => adminEmailBlockService.discardDraft(id));
}

export function useDuplicateEmailBlock() {
  return useBlockMutation(({ id, key, name }: { id: string; key: string; name: string }) =>
    adminEmailBlockService.duplicate(id, key, name),
  );
}

export function useArchiveEmailBlock() {
  return useBlockMutation((id: string) => adminEmailBlockService.archive(id));
}

export function useUnarchiveEmailBlock() {
  return useBlockMutation((id: string) => adminEmailBlockService.unarchive(id));
}

export function useSetDefaultEmailLayout() {
  return useBlockMutation((id: string) => adminEmailBlockService.setDefault(id));
}

export function useDeleteEmailBlock() {
  return useBlockMutation((id: string) => adminEmailBlockService.remove(id));
}

export function useRestoreEmailBlockVersion() {
  return useBlockMutation(({ id, version }: { id: string; version: number }) => adminEmailBlockService.restore(id, version));
}

export function useEmailBlockBulk() {
  return useBlockMutation(({ action, ids }: { action: EmailBlockBulkAction; ids: string[] }) =>
    adminEmailBlockService.bulk(action, ids),
  );
}

/** A stored block rendered inside an email: its thumbnail and preview. */
export function useRenderedBlock(
  id: string | undefined,
  query: { dark?: boolean; templateKey?: string | null; locale?: string; draft?: boolean },
  enabled = true,
) {
  return useQuery({
    queryKey: ["email-render", "block", id ?? "", query] as const,
    queryFn: () => adminEmailBlockService.render(id!, query),
    enabled: Boolean(id) && enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
