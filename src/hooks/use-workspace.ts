"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkspaceService } from "@/services/workspace.service";
import type { WorkspaceSettingsDto } from "@/types/workspace";
import { WORKSPACE_DOCUMENT_INGESTION_STATUS } from "@/constants/workspace-document";

// Query Keys
export const WORKSPACE_KEYS = {
  list: (page: number, pageSize: number, search: string) => ["workspaces", "list", { page, pageSize, search }] as const,
  detail: (id: string) => ["workspaces", "detail", id] as const,
  settings: (id: string) => ["workspaces", "settings", id] as const,
  members: (workspaceId: string, page: number, pageSize: number, search: string) =>
    ["workspaces", "members", workspaceId, { page, pageSize, search }] as const,
  invitations: (workspaceId: string, page: number, pageSize: number, search: string) =>
    ["workspaces", "invitations", workspaceId, { page, pageSize, search }] as const,
  pendingInvitations: () => ["workspaces", "invitations", "pending"] as const,
  invitationPreview: (token: string) => ["workspaces", "invitation-preview", token] as const,
  documentLists: (workspaceId: string) => ["workspaces", "documents", workspaceId] as const,
  documents: (workspaceId: string, page: number, pageSize: number, search: string) =>
    ["workspaces", "documents", workspaceId, { page, pageSize, search }] as const,
  documentDetail: (workspaceId: string, docId: string) => ["workspaces", "document", workspaceId, docId] as const,
  documentPolicies: (workspaceId: string, docId: string, page: number, pageSize: number) =>
    ["workspaces", "document-policies", workspaceId, docId, { page, pageSize }] as const,
  glossaries: (workspaceId: string) => ["glossaries", "list", workspaceId] as const,
  glossaryDetail: (id: string) => ["glossaries", "detail", id] as const,
  terms: (glossaryId: string) => ["glossaries", "terms", glossaryId] as const,
};

// ─── Workspaces ───

export function useWorkspaces(page = 1, pageSize = 10, search = "") {
  return useQuery({
    queryKey: WORKSPACE_KEYS.list(page, pageSize, search),
    queryFn: () => WorkspaceService.list(page, pageSize, search),
    placeholderData: (previousData) => previousData,
    staleTime: 30000,
  });
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.detail(id),
    queryFn: () => WorkspaceService.getById(id),
    enabled: !!id,
    staleTime: 60000,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: WorkspaceService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useSelectWorkspace() {
  return useMutation({
    mutationFn: WorkspaceService.select,
  });
}


export function useWorkspaceSettings(id: string) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.settings(id),
    queryFn: () => WorkspaceService.getSettings(id),
    enabled: !!id,
    staleTime: 60000,
  });
}

export function useUpdateWorkspaceSettings(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: WorkspaceSettingsDto) => WorkspaceService.updateSettings(workspaceId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.settings(workspaceId) });
    },
  });
}

// ─── Members ───

export function useWorkspaceMembers(workspaceId: string | undefined, page = 1, pageSize = 10, search = "") {
  return useQuery({
    queryKey: WORKSPACE_KEYS.members(workspaceId ?? "", page, pageSize, search),
    queryFn: () => WorkspaceService.listMembers(workspaceId ?? "", page, pageSize, search),
    enabled: !!workspaceId,
    placeholderData: (previousData) => previousData,
    staleTime: 30000,
  });
}

export function useRemoveWorkspaceMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => WorkspaceService.removeMember(workspaceId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", "members", workspaceId] });
    },
  });
}

export function useChangeWorkspaceMemberRole(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleName }: { userId: string; roleName: string }) =>
      WorkspaceService.changeMemberRole(workspaceId, userId, roleName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", "members", workspaceId] });
    },
  });
}

export function useTransferWorkspaceOwnership(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newOwnerId: string) => WorkspaceService.transferOwnership(workspaceId, newOwnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", "members", workspaceId] });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.detail(workspaceId) });
    },
  });
}

export function useUpdateWorkspaceMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, canCreateMeetings }: { userId: string; canCreateMeetings: boolean }) =>
      WorkspaceService.updateMember(workspaceId, userId, canCreateMeetings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", "members", workspaceId] });
    },
  });
}

// ─── Invitations ───

export function useInviteWorkspaceMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, roleName }: { email: string; roleName: string }) =>
      WorkspaceService.invite(workspaceId, email, roleName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", "invitations", workspaceId] });
    },
  });
}

export function useWorkspaceInvitations(workspaceId: string, page = 1, pageSize = 10, search = "") {
  return useQuery({
    queryKey: WORKSPACE_KEYS.invitations(workspaceId, page, pageSize, search),
    queryFn: () => WorkspaceService.listInvitations(workspaceId, page, pageSize, search),
    enabled: !!workspaceId,
    placeholderData: (previousData) => previousData,
    staleTime: 30000,
  });
}

export function useRevokeWorkspaceInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => WorkspaceService.revokeInvitation(workspaceId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", "invitations", workspaceId] });
    },
  });
}

export function usePreviewWorkspaceInvitation(token: string) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.invitationPreview(token),
    queryFn: () => WorkspaceService.previewInvitation(token),
    enabled: !!token,
    staleTime: 60000,
  });
}

export function useAcceptWorkspaceInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: WorkspaceService.acceptInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function usePendingWorkspaceInvitations() {
  return useQuery({
    queryKey: WORKSPACE_KEYS.pendingInvitations(),
    queryFn: WorkspaceService.getPendingInvitations,
    staleTime: 30000,
  });
}

export function useAcceptWorkspaceInvitationById() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: WorkspaceService.acceptInvitationById,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.pendingInvitations() });
    },
  });
}

// ─── Documents ───

export function useUploadWorkspaceDocument(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Parameters<typeof WorkspaceService.uploadDocument>[1]) =>
      WorkspaceService.uploadDocument(workspaceId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentLists(workspaceId) });
    },
  });
}

export function useArchiveWorkspaceDocument(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => WorkspaceService.archiveDocument(workspaceId, docId),
    onSuccess: (_, docId) => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentDetail(workspaceId, docId) });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentLists(workspaceId) });
    },
  });
}

export function useRestoreWorkspaceDocument(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => WorkspaceService.restoreDocument(workspaceId, docId),
    onSuccess: (_, docId) => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentDetail(workspaceId, docId) });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentLists(workspaceId) });
    },
  });
}

export function useWorkspaceDocuments(workspaceId: string, page = 1, pageSize = 10, search = "") {
  return useQuery({
    queryKey: WORKSPACE_KEYS.documents(workspaceId, page, pageSize, search),
    queryFn: () => WorkspaceService.listDocuments(workspaceId, page, pageSize, search),
    enabled: !!workspaceId,
    placeholderData: (previousData) => previousData,
    staleTime: 3000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || !data.items) return false;
      const hasActiveProcessing = data.items.some((doc: { ingestionStatus?: string }) => {
        const status = doc.ingestionStatus?.toLowerCase();
        return status === WORKSPACE_DOCUMENT_INGESTION_STATUS.PROCESSING || status === WORKSPACE_DOCUMENT_INGESTION_STATUS.PENDING;
      });
      return hasActiveProcessing ? 3000 : false;
    },
  });
}

export function useWorkspaceDocument(workspaceId: string, docId: string) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.documentDetail(workspaceId, docId),
    queryFn: () => WorkspaceService.getDocumentById(workspaceId, docId),
    enabled: !!workspaceId && !!docId,
    staleTime: 3000,
    refetchInterval: (query) => {
      const status = query.state.data?.ingestionStatus?.toLowerCase();
      const isProcessing = status === WORKSPACE_DOCUMENT_INGESTION_STATUS.PROCESSING || status === WORKSPACE_DOCUMENT_INGESTION_STATUS.PENDING;
      return isProcessing ? 3000 : false;
    },
  });
}

export function useWorkspaceDocumentExtractedText(
  workspaceId: string,
  docId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["workspaces", "document-extracted-text", workspaceId, docId],
    queryFn: () => WorkspaceService.getExtractedText(workspaceId, docId),
    enabled: (options?.enabled ?? true) && !!workspaceId && !!docId,
    staleTime: 30000,
  });
}

export function useUpdateWorkspaceDocumentExtractedText(workspaceId: string, docId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => WorkspaceService.updateExtractedText(workspaceId, docId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", "document-extracted-text", workspaceId, docId] });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentDetail(workspaceId, docId) });
    },
  });
}

export function usePatchWorkspaceDocumentMetadata(workspaceId: string, docId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { name?: string; confidentialityLevel?: string; isAiAllowed?: boolean }) =>
      WorkspaceService.patchDocumentMetadata(workspaceId, docId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentDetail(workspaceId, docId) });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentLists(workspaceId) });
    },
  });
}

export function useApproveWorkspaceDocument(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, approve }: { docId: string; approve: boolean }) =>
      WorkspaceService.approveDocument(workspaceId, docId, approve),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentDetail(workspaceId, variables.docId) });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentLists(workspaceId) });
    },
  });
}

export function useDeleteWorkspaceDocument(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => WorkspaceService.deleteDocument(workspaceId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentLists(workspaceId) });
    },
  });
}

export function useAddWorkspaceDocumentAccessPolicy(workspaceId: string, docId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (policy: {
      subjectType: string;
      subjectId?: string | null;
      subjectKey?: string | null;
      permission: string;
      effect: string;
    }) => WorkspaceService.addAccessPolicy(workspaceId, docId, policy),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentPolicies(workspaceId, docId, 1, 100) });
    },
  });
}

export function useRemoveWorkspaceDocumentAccessPolicy(workspaceId: string, docId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (policyId: string) => WorkspaceService.removeAccessPolicy(workspaceId, docId, policyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentPolicies(workspaceId, docId, 1, 100) });
    },
  });
}

export function useWorkspaceDocumentAccessPolicies(workspaceId: string, docId: string, page = 1, pageSize = 10) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.documentPolicies(workspaceId, docId, page, pageSize),
    queryFn: () => WorkspaceService.getAccessPolicies(workspaceId, docId, page, pageSize),
    enabled: !!workspaceId && !!docId,
    placeholderData: (previousData) => previousData,
    staleTime: 30000,
  });
}

// ─── Glossaries ───

export function useCreateGlossary(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Omit<Parameters<typeof WorkspaceService.createGlossary>[0], "workspaceId">) =>
      WorkspaceService.createGlossary({ ...request, workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.glossaries(workspaceId) });
    },
  });
}

export function useGlossary(id: string) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.glossaryDetail(id),
    queryFn: () => WorkspaceService.getGlossary(id),
    enabled: !!id,
    staleTime: 60000,
  });
}

export function useGlossariesByWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.glossaries(workspaceId),
    queryFn: () => WorkspaceService.getGlossariesByWorkspace(workspaceId),
    enabled: !!workspaceId,
    staleTime: 60000,
  });
}

export function useUpdateGlossary(workspaceId: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Parameters<typeof WorkspaceService.updateGlossary>[1]) =>
      WorkspaceService.updateGlossary(id, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.glossaryDetail(id) });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.glossaries(workspaceId) });
    },
  });
}

export function useDeleteGlossary(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => WorkspaceService.deleteGlossary(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.glossaries(workspaceId) });
    },
  });
}

export function useAddGlossaryTerm(glossaryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Parameters<typeof WorkspaceService.addTerm>[1]) =>
      WorkspaceService.addTerm(glossaryId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.terms(glossaryId) });
    },
  });
}

export function useGlossaryTerms(glossaryId: string) {
  return useQuery({
    queryKey: WORKSPACE_KEYS.terms(glossaryId),
    queryFn: () => WorkspaceService.getTerms(glossaryId),
    enabled: !!glossaryId,
    staleTime: 30000,
  });
}

export function usePublishedGlobalGlossaryTerms() {
  return useQuery({
    queryKey: ["glossaries", "global-published"] as const,
    queryFn: () => WorkspaceService.getPublishedGlobalTerms(),
    staleTime: 60000,
  });
}

export function useUpdateGlossaryTerm(glossaryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ termId, request }: { termId: string; request: Parameters<typeof WorkspaceService.updateTerm>[2] }) =>
      WorkspaceService.updateTerm(glossaryId, termId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.terms(glossaryId) });
    },
  });
}

export function useDeleteGlossaryTerm(glossaryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (termId: string) => WorkspaceService.deleteTerm(glossaryId, termId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.terms(glossaryId) });
    },
  });
}

export function useDownloadWorkspaceDocument(workspaceId: string) {
  return useMutation({
    mutationFn: (docId: string) => WorkspaceService.downloadDocument(workspaceId, docId),
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => WorkspaceService.deleteWorkspace(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}
