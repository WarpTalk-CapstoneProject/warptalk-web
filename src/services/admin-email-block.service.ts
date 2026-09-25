import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  BulkResultDto,
  CreateEmailBlockRequest,
  EmailBlockBulkAction,
  EmailBlockDto,
  EmailBlockKind,
  EmailBlockPreviewRequest,
  EmailCmsVersionDto,
  EmailPreviewDto,
  PublishEmailRequest,
  SaveEmailBlockDraftRequest,
} from "@/types/admin-cms";

/**
 * Email layouts and reusable blocks. Publishing one changes every email that uses it, which is
 * why the server refuses a publish that would break a published email.
 */
export const adminEmailBlockService = {
  list: async (kind?: EmailBlockKind): Promise<EmailBlockDto[]> =>
    (await apiClient.get<EmailBlockDto[]>(API.adminEmailBlocks.base, { params: kind ? { kind } : undefined })).data,

  get: async (id: string): Promise<EmailBlockDto> =>
    (await apiClient.get<EmailBlockDto>(API.adminEmailBlocks.detail(id))).data,

  create: async (request: CreateEmailBlockRequest): Promise<EmailBlockDto> =>
    (await apiClient.post<EmailBlockDto>(API.adminEmailBlocks.base, request)).data,

  saveDraft: async (id: string, request: SaveEmailBlockDraftRequest): Promise<EmailBlockDto> =>
    (await apiClient.put<EmailBlockDto>(API.adminEmailBlocks.action(id, "draft"), request)).data,

  publish: async (id: string, request: PublishEmailRequest): Promise<EmailBlockDto> =>
    (await apiClient.post<EmailBlockDto>(API.adminEmailBlocks.action(id, "publish"), request)).data,

  discardDraft: async (id: string): Promise<EmailBlockDto> =>
    (await apiClient.post<EmailBlockDto>(API.adminEmailBlocks.action(id, "discard-draft"))).data,

  duplicate: async (id: string, key: string, name: string): Promise<EmailBlockDto> =>
    (await apiClient.post<EmailBlockDto>(API.adminEmailBlocks.action(id, "duplicate"), { key, name })).data,

  archive: async (id: string): Promise<EmailBlockDto> =>
    (await apiClient.post<EmailBlockDto>(API.adminEmailBlocks.action(id, "archive"))).data,

  unarchive: async (id: string): Promise<EmailBlockDto> =>
    (await apiClient.post<EmailBlockDto>(API.adminEmailBlocks.action(id, "unarchive"))).data,

  setDefault: async (id: string): Promise<EmailBlockDto> =>
    (await apiClient.post<EmailBlockDto>(API.adminEmailBlocks.action(id, "set-default"))).data,

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(API.adminEmailBlocks.detail(id));
  },

  versions: async (id: string): Promise<EmailCmsVersionDto[]> =>
    (await apiClient.get<EmailCmsVersionDto[]>(API.adminEmailBlocks.action(id, "versions"))).data,

  restore: async (id: string, version: number): Promise<EmailBlockDto> =>
    (await apiClient.post<EmailBlockDto>(API.adminEmailBlocks.restore(id, version))).data,

  preview: async (kind: EmailBlockKind, request: EmailBlockPreviewRequest): Promise<EmailPreviewDto> =>
    (await apiClient.post<EmailPreviewDto>(API.adminEmailBlocks.preview, request, { params: { kind } })).data,

  bulk: async (action: EmailBlockBulkAction, ids: string[]): Promise<BulkResultDto> =>
    (await apiClient.post<BulkResultDto>(API.adminEmailBlocks.bulk, { action, ids })).data,

  /** v3: the stored block rendered inside an email (published side unless draft). */
  render: async (id: string, query: { dark?: boolean; templateKey?: string | null; locale?: string; draft?: boolean }): Promise<EmailPreviewDto> =>
    (
      await apiClient.get<EmailPreviewDto>(API.adminEmailBlocks.action(id, "render"), {
        params: {
          dark: query.dark ?? false,
          templateKey: query.templateKey || undefined,
          locale: query.locale ?? "en",
          draft: query.draft ?? false,
        },
      })
    ).data,
};
