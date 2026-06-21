import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  WorkspaceDto,
  CreateWorkspaceRequest,
  WorkspaceSettingsDto,
  WorkspaceMemberDto,
  WorkspaceInvitationDto,
  WorkspaceDocumentDto,
  WorkspaceDocumentAccessPolicyDto,
  GlossaryDto,
  GlossaryTermDto,
  PagedResult,
  SelectWorkspaceResponse,
  InviteMemberResponse,
  PreviewInvitationResponse,
  ExtractedTextDto
} from "@/types/workspace";

export const WorkspaceService = {
  // ─── Workspaces ───
  async list(page = 1, pageSize = 10, search = ""): Promise<PagedResult<WorkspaceDto>> {
    const { data } = await apiClient.get<PagedResult<WorkspaceDto>>(API.workspaces.base, {
      params: { page, pageSize, search },
    });
    return data;
  },

  async create(request: CreateWorkspaceRequest): Promise<WorkspaceDto> {
    const { data } = await apiClient.post<WorkspaceDto>(API.workspaces.base, request);
    return data;
  },

  async getById(id: string): Promise<WorkspaceDto> {
    const { data } = await apiClient.get<WorkspaceDto>(API.workspaces.get(id));
    return data;
  },

  async select(id: string): Promise<SelectWorkspaceResponse> {
    const { data } = await apiClient.post<SelectWorkspaceResponse>(API.workspaces.select(id));
    return data;
  },

  async getSettings(id: string): Promise<WorkspaceSettingsDto> {
    const { data } = await apiClient.get<WorkspaceSettingsDto>(API.workspaces.settings(id));
    return data;
  },

  async updateSettings(id: string, settings: WorkspaceSettingsDto): Promise<void> {
    await apiClient.put(API.workspaces.settings(id), settings);
  },

  async deleteWorkspace(id: string): Promise<void> {
    await apiClient.delete(API.workspaces.get(id));
  },

  // ─── Members ───
  async listMembers(workspaceId: string, page = 1, pageSize = 10, search = ""): Promise<PagedResult<WorkspaceMemberDto>> {
    const { data } = await apiClient.get<PagedResult<WorkspaceMemberDto>>(API.workspaces.members(workspaceId), {
      params: { page, pageSize, search },
    });
    return data;
  },

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    await apiClient.delete(API.workspaces.memberDetail(workspaceId, userId));
  },

  async changeMemberRole(workspaceId: string, userId: string, roleName: string): Promise<void> {
    await apiClient.put(API.workspaces.memberRole(workspaceId, userId), { roleName });
  },

  async transferOwnership(workspaceId: string, newOwnerId: string): Promise<void> {
    await apiClient.post(API.workspaces.transferOwnership(workspaceId), { newOwnerId });
  },

  async updateMember(workspaceId: string, userId: string, canCreateMeetings: boolean): Promise<void> {
    await apiClient.patch(API.workspaces.memberDetail(workspaceId, userId), { canCreateMeetings });
  },

  // ─── Invitations ───
  async invite(workspaceId: string, email: string, roleName: string, membershipType: string): Promise<InviteMemberResponse> {
    const { data } = await apiClient.post<InviteMemberResponse>(API.workspaces.invitations(workspaceId), {
      email,
      roleName,
      membershipType,
    });
    return data;
  },

  async listInvitations(workspaceId: string, page = 1, pageSize = 10, search = ""): Promise<PagedResult<WorkspaceInvitationDto>> {
    const { data } = await apiClient.get<PagedResult<WorkspaceInvitationDto>>(API.workspaces.invitations(workspaceId), {
      params: { page, pageSize, search },
    });
    return data;
  },

  async revokeInvitation(workspaceId: string, inviteId: string): Promise<void> {
    await apiClient.delete(API.workspaces.revokeInvitation(workspaceId, inviteId));
  },

  async createJoinRequest(request: { roomCode?: string; workspaceSlug?: string }): Promise<WorkspaceInvitationDto> {
    const { data } = await apiClient.post<WorkspaceInvitationDto>(API.workspaces.joinRequests, request);
    return data;
  },

  async approveJoinRequest(workspaceId: string, inviteId: string): Promise<void> {
    await apiClient.post(API.workspaces.approveJoinRequest(workspaceId, inviteId));
  },

  async rejectJoinRequest(workspaceId: string, inviteId: string): Promise<void> {
    await apiClient.post(API.workspaces.rejectJoinRequest(workspaceId, inviteId));
  },

  async previewInvitation(token: string): Promise<PreviewInvitationResponse> {
    const { data } = await apiClient.get<PreviewInvitationResponse>(API.workspaces.previewInvitation(token));
    return data;
  },

  async acceptInvitation(token: string): Promise<void> {
    await apiClient.post(API.workspaces.acceptInvitation, { token });
  },

  // ─── Documents ───
  async uploadDocument(
    workspaceId: string,
    request: {
      name: string;
      sourceType: string;
      sourceId?: string | null;
      isSensitive: boolean;
      file: File;
    }
  ): Promise<WorkspaceDocumentDto> {
    const formData = new FormData();
    formData.append("name", request.name);
    formData.append("sourceType", request.sourceType);
    if (request.sourceId) {
      formData.append("sourceId", request.sourceId);
    }
    formData.append("isSensitive", String(request.isSensitive));
    formData.append("file", request.file);

    const { data } = await apiClient.post<WorkspaceDocumentDto>(
      API.workspaces.documents(workspaceId),
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return data;
  },

  async archiveDocument(workspaceId: string, docId: string): Promise<void> {
    await apiClient.post(API.workspaces.documentDetail(workspaceId, docId) + "/archive");
  },

  async restoreDocument(workspaceId: string, docId: string): Promise<void> {
    await apiClient.post(API.workspaces.documentDetail(workspaceId, docId) + "/restore");
  },

  async listDocuments(workspaceId: string, page = 1, pageSize = 10, search = ""): Promise<PagedResult<WorkspaceDocumentDto>> {
    const { data } = await apiClient.get<PagedResult<WorkspaceDocumentDto>>(API.workspaces.documents(workspaceId), {
      params: { page, pageSize, search },
    });
    return data;
  },

  async getDocumentById(workspaceId: string, docId: string): Promise<WorkspaceDocumentDto> {
    const { data } = await apiClient.get<WorkspaceDocumentDto>(API.workspaces.documentDetail(workspaceId, docId));
    return data;
  },

  async getExtractedText(workspaceId: string, docId: string): Promise<ExtractedTextDto> {
    const { data } = await apiClient.get<ExtractedTextDto>(API.workspaces.documentExtractedText(workspaceId, docId));
    return data;
  },

  async patchDocumentMetadata(
    workspaceId: string,
    docId: string,
    request: {
      name?: string;
      isSensitive?: boolean;
    }
  ): Promise<WorkspaceDocumentDto> {
    const { data } = await apiClient.patch<WorkspaceDocumentDto>(API.workspaces.documentDetail(workspaceId, docId), request);
    return data;
  },

  async approveDocument(workspaceId: string, docId: string, approve: boolean): Promise<void> {
    await apiClient.post(API.workspaces.documentApprove(workspaceId, docId), { approve });
  },

  async downloadDocument(workspaceId: string, docId: string): Promise<WorkspaceDocumentDto> {
    const { data } = await apiClient.get<WorkspaceDocumentDto>(API.workspaces.documentDownload(workspaceId, docId));
    return data;
  },

  async deleteDocument(workspaceId: string, docId: string): Promise<void> {
    await apiClient.delete(API.workspaces.documentDetail(workspaceId, docId));
  },

  async addAccessPolicy(
    workspaceId: string,
    docId: string,
    policy: {
      subjectType: string;
      subjectId?: string | null;
      subjectKey?: string | null;
      permission: string;
      effect: string;
    }
  ): Promise<void> {
    await apiClient.post(API.workspaces.documentPolicies(workspaceId, docId), policy);
  },

  async removeAccessPolicy(workspaceId: string, docId: string, policyId: string): Promise<void> {
    await apiClient.delete(API.workspaces.documentPolicyDetail(workspaceId, docId, policyId));
  },

  async getAccessPolicies(workspaceId: string, docId: string, page = 1, pageSize = 10): Promise<PagedResult<WorkspaceDocumentAccessPolicyDto>> {
    const { data } = await apiClient.get<PagedResult<WorkspaceDocumentAccessPolicyDto>>(API.workspaces.documentPolicies(workspaceId, docId), {
      params: { page, pageSize },
    });
    return data;
  },

  // ─── Glossaries (Terminology) ───
  async createGlossary(request: {
    workspaceId: string;
    name: string;
    description?: string | null;
    businessDomain: string;
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<void> {
    await apiClient.post(API.glossaries.base, request);
  },

  async getGlossary(id: string): Promise<GlossaryDto> {
    const { data } = await apiClient.get<GlossaryDto>(API.glossaries.get(id));
    return data;
  },

  async getGlossariesByWorkspace(workspaceId: string): Promise<GlossaryDto[]> {
    const { data } = await apiClient.get<GlossaryDto[]>(API.glossaries.byWorkspace(workspaceId));
    return data;
  },

  async updateGlossary(id: string, request: {
    name: string;
    description?: string | null;
    businessDomain: string;
    sourceLanguage: string;
    targetLanguage: string;
    isActive: boolean;
  }): Promise<void> {
    await apiClient.put(API.glossaries.get(id), request);
  },

  async deleteGlossary(id: string): Promise<void> {
    await apiClient.delete(API.glossaries.get(id));
  },

  async addTerm(glossaryId: string, request: {
    term: string;
    preferredTranslation: string;
    definition?: string | null;
    usageNote?: string | null;
  }): Promise<void> {
    await apiClient.post(API.glossaries.terms(glossaryId), request);
  },

  async getTerms(glossaryId: string): Promise<GlossaryTermDto[]> {
    const { data } = await apiClient.get<GlossaryTermDto[]>(API.glossaries.terms(glossaryId));
    return data;
  },

  async updateTerm(glossaryId: string, termId: string, request: {
    term: string;
    preferredTranslation: string;
    definition?: string | null;
    usageNote?: string | null;
    status: string;
  }): Promise<void> {
    await apiClient.put(API.glossaries.termDetail(glossaryId, termId), request);
  },

  async deleteTerm(glossaryId: string, termId: string): Promise<void> {
    await apiClient.delete(API.glossaries.termDetail(glossaryId, termId));
  },
};
