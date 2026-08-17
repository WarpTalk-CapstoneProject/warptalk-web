import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { GlobalGlossaryTermDto } from "@/types/global-glossary";
import type {
  UpdateKnowledgeChunkRequest,
  WorkspaceKnowledgeChunkDto,
  WorkspaceKnowledgePageDto,
  WorkspaceKnowledgeQuery,
} from "@/types/workspace-knowledge";
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
  InvitationPolicyResponse,
  PreviewInvitationResponse,
  ExtractedTextDto,
  WorkspaceRoleChangePreview,
  ApplyWorkspaceRoleChangeRequest,
  WorkspaceRoleChangeResult,
  VerifiedDomainDto
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

  /**
   * Replaces the whole settings document. The PUT binds the complete `WorkspaceSettingsDto`
   * server-side, so every field must be present — use `patchSettings` for single-field edits.
   */
  async updateSettings(id: string, settings: WorkspaceSettingsDto): Promise<void> {
    await apiClient.put(API.workspaces.settings(id), settings);
  },

  /**
   * Sends only the changed keys. The server reads the current document, merges the supplied
   * keys over it and writes the result back, returning the merged document.
   */
  async patchSettings(
    id: string,
    patch: Partial<WorkspaceSettingsDto>,
  ): Promise<WorkspaceSettingsDto> {
    const { data } = await apiClient.patch<WorkspaceSettingsDto>(
      API.workspaces.settings(id),
      patch,
    );
    return data;
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

  async previewMemberRoleChange(
    workspaceId: string,
    userId: string,
    targetRole: string
  ): Promise<WorkspaceRoleChangePreview> {
    const { data } = await apiClient.get<WorkspaceRoleChangePreview>(
      API.workspaces.memberRoleChangePreview(workspaceId, userId),
      { params: { toRole: targetRole } }
    );
    return data;
  },

  async applyMemberRoleChange(
    workspaceId: string,
    userId: string,
    request: ApplyWorkspaceRoleChangeRequest
  ): Promise<WorkspaceRoleChangeResult> {
    const { data } = await apiClient.post<WorkspaceRoleChangeResult>(
      API.workspaces.memberRoleChange(workspaceId, userId),
      request
    );
    return data;
  },

  async transferOwnership(workspaceId: string, newOwnerId: string): Promise<void> {
    await apiClient.post(API.workspaces.transferOwnership(workspaceId), { newOwnerId });
  },

  async updateMember(workspaceId: string, userId: string, canCreateMeetings: boolean): Promise<void> {
    await apiClient.patch(API.workspaces.memberDetail(workspaceId, userId), { canCreateMeetings });
  },

  // ─── Invitations ───
  async invite(
    workspaceId: string,
    email: string,
    roleName: string,
    membershipType: "Internal" | "External",
  ): Promise<InviteMemberResponse> {
    const { data } = await apiClient.post<InviteMemberResponse>(API.workspaces.invitations(workspaceId), {
      email,
      roleName,
      membershipType,
    });
    return data;
  },

  async getInvitationPolicy(workspaceId: string, email: string): Promise<InvitationPolicyResponse> {
    const { data } = await apiClient.get<InvitationPolicyResponse>(
      API.workspaces.invitationPolicy(workspaceId),
      { params: { email } },
    );
    return data;
  },

  /**
   * The workspace's verified domains, from the table that owns them.
   *
   * These three used to go through PATCH /settings, editing the `verifiedDomains` array inside
   * the settings JSON. That array is a display mirror which the backend refreshes from the table
   * and ignores on write, so adding or revoking a domain that way changed nothing at all.
   */
  async listVerifiedDomains(workspaceId: string): Promise<VerifiedDomainDto[]> {
    const { data } = await apiClient.get<VerifiedDomainDto[]>(API.workspaces.verifiedDomains(workspaceId));
    return data;
  },

  /**
   * @param consentVersion Required when the domain is not the caller's own email domain — nothing
   * can verify such a claim, so the Owner's recorded agreement is the evidence behind it.
   */
  async addVerifiedDomain(
    workspaceId: string,
    domain: string,
    consentVersion?: string,
  ): Promise<VerifiedDomainDto> {
    const { data } = await apiClient.post<VerifiedDomainDto>(
      API.workspaces.verifiedDomains(workspaceId),
      { domain, consentVersion },
    );
    return data;
  },

  async revokeVerifiedDomain(workspaceId: string, domainId: string): Promise<void> {
    await apiClient.delete(API.workspaces.verifiedDomainDetail(workspaceId, domainId));
  },

  async retryInvitation(workspaceId: string, inviteId: string): Promise<WorkspaceInvitationDto> {
    const { data } = await apiClient.post<WorkspaceInvitationDto>(API.workspaces.retryInvitation(workspaceId, inviteId));
    return data;
  },

  async listInvitations(workspaceId: string, page = 1, pageSize = 10, search = "", category?: string): Promise<PagedResult<WorkspaceInvitationDto>> {
    const { data } = await apiClient.get<PagedResult<WorkspaceInvitationDto>>(API.workspaces.invitations(workspaceId), {
      params: { page, pageSize, search, category },
    });
    return data;
  },

  async getPendingInvitations(): Promise<WorkspaceInvitationDto[]> {
    const { data } = await apiClient.get<WorkspaceInvitationDto[]>(API.workspaces.pendingInvitations);
    return data;
  },

  async revokeInvitation(workspaceId: string, inviteId: string): Promise<void> {
    await apiClient.delete(API.workspaces.revokeInvitation(workspaceId, inviteId));
  },

  async createJoinRequest(request: { roomCode?: string; workspaceSlug?: string }): Promise<WorkspaceInvitationDto> {
    const { data } = await apiClient.post<WorkspaceInvitationDto>(API.workspaces.joinRequests, request);
    return data;
  },

  async approveJoinRequest(
    workspaceId: string,
    payload: { inviteId: string; membershipType?: string }
  ): Promise<{ approvalEmailStatus?: string }> {
    const { data } = await apiClient.post<{ approvalEmailStatus?: string }>(
      API.workspaces.approveJoinRequest(workspaceId, payload.inviteId),
      { membershipType: payload.membershipType }
    );
    return data || {};
  },

  async rejectJoinRequest(workspaceId: string, inviteId: string): Promise<void> {
    await apiClient.post(API.workspaces.rejectJoinRequest(workspaceId, inviteId));
  },

  async previewInvitation(token: string): Promise<PreviewInvitationResponse> {
    const { data } = await apiClient.get<PreviewInvitationResponse>(API.workspaces.previewInvitation(token));
    return data;
  },

  async acceptInvitation(token?: string): Promise<void> {
    await apiClient.post(API.workspaces.acceptInvitation, { token });
  },

  async acceptInvitationById(inviteId: string): Promise<void> {
    await apiClient.post(API.workspaces.acceptInvitationById(inviteId));
  },

  // ─── Documents ───
  async uploadDocument(
    workspaceId: string,
    request: {
      name: string;
      sourceType: string;
      sourceId?: string | null;
      confidentialityLevel?: string;
      isAiAllowed?: boolean;
      file: File;
    }
  ): Promise<WorkspaceDocumentDto> {
    const formData = new FormData();
    formData.append("name", request.name);
    formData.append("sourceType", request.sourceType);
    if (request.sourceId) {
      formData.append("sourceId", request.sourceId);
    }
    if (request.confidentialityLevel) {
      formData.append("confidentialityLevel", request.confidentialityLevel);
    }
    formData.append("isAiAllowed", String(request.isAiAllowed ?? true));
    formData.append("file", request.file);

    const { data } = await apiClient.postForm<WorkspaceDocumentDto>(
      API.workspaces.documents(workspaceId),
      formData
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

  /**
   * One page of indexed chunks for this workspace. Cursor-based, because the vector store
   * pages by continuation token — an offset API on top of it would rescan from the start
   * every page and silently skip or repeat rows when the collection changes mid-listing.
   */
  async listKnowledge(
    workspaceId: string,
    query: WorkspaceKnowledgeQuery = {},
  ): Promise<WorkspaceKnowledgePageDto> {
    const { data } = await apiClient.get<WorkspaceKnowledgePageDto>(
      API.workspaces.knowledge(workspaceId),
      { params: query },
    );
    return data;
  },

  /**
   * Corrects one chunk's fact, category and retrievability. Owner only, server-side.
   *
   * The indexed text is deliberately not in the payload: it is what the vector was computed
   * from, and changing it without re-embedding would leave WarpBot retrieving on the old
   * meaning while showing the new words.
   */
  async updateKnowledgeChunk(
    workspaceId: string,
    chunkId: string,
    update: UpdateKnowledgeChunkRequest,
  ): Promise<WorkspaceKnowledgeChunkDto> {
    const { data } = await apiClient.patch<WorkspaceKnowledgeChunkDto>(
      API.workspaces.knowledgeChunk(workspaceId, chunkId),
      update,
    );
    return data;
  },

  /** Removes the chunk from the index. The document or meeting it came from is untouched. */
  async deleteKnowledgeChunk(workspaceId: string, chunkId: string): Promise<void> {
    await apiClient.delete(API.workspaces.knowledgeChunk(workspaceId, chunkId));
  },

  async getDocumentById(workspaceId: string, docId: string): Promise<WorkspaceDocumentDto> {
    const { data } = await apiClient.get<WorkspaceDocumentDto>(API.workspaces.documentDetail(workspaceId, docId));
    return data;
  },

  async getExtractedText(workspaceId: string, docId: string): Promise<ExtractedTextDto> {
    const { data } = await apiClient.get<ExtractedTextDto>(API.workspaces.documentExtractedText(workspaceId, docId));
    return data;
  },

  async updateExtractedText(workspaceId: string, docId: string, text: string): Promise<ExtractedTextDto> {
    const { data } = await apiClient.put<ExtractedTextDto>(API.workspaces.documentExtractedText(workspaceId, docId), { text });
    return data;
  },

  async patchDocumentMetadata(
    workspaceId: string,
    docId: string,
    request: {
      name?: string;
      confidentialityLevel?: string;
      isAiAllowed?: boolean;
    }
  ): Promise<WorkspaceDocumentDto> {
    const { data } = await apiClient.patch<WorkspaceDocumentDto>(API.workspaces.documentDetail(workspaceId, docId), request);
    return data;
  },

  async approveDocument(workspaceId: string, docId: string, approve: boolean): Promise<void> {
    await apiClient.post(API.workspaces.documentApprove(workspaceId, docId), { approve });
  },

  async downloadDocument(workspaceId: string, docId: string): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(API.workspaces.documentDownload(workspaceId, docId), {
      responseType: "blob",
    });
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
  // Field names below match the real backend DTOs (WarpTalk.TranscriptService.Application.DTOs
  // GlossaryDtos.cs) exactly — a previous version of this file used a different, unused shape
  // (businessDomain/term/preferredTranslation/definition/usageNote/status) that never matched
  // what GlossariesController actually accepts/returns. See docs/global-glossary-plan.md §1.2/§1.3.
  async createGlossary(request: {
    workspaceId: string;
    name: string;
    description?: string | null;
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
    isActive: boolean;
  }): Promise<void> {
    await apiClient.put(API.glossaries.get(id), request);
  },

  async deleteGlossary(id: string): Promise<void> {
    await apiClient.delete(API.glossaries.get(id));
  },

  async addTerm(glossaryId: string, request: {
    sourceTerm: string;
    targetTerm: string;
    context?: string | null;
    domain?: string | null;
    definition?: string | null;
    usageNote?: string | null;
    partOfSpeech?: string | null;
    priority?: number;
  }): Promise<void> {
    await apiClient.post(API.glossaries.terms(glossaryId), request);
  },

  /**
   * WT-472 — import many terms in one request.
   *
   * The server skips terms already in the glossary and REPORTS how many it skipped, so a caller
   * must show both numbers. "100 imported" when 60 were written is how somebody comes to believe a
   * term exists that does not.
   */
  async bulkImportTerms(
    glossaryId: string,
    terms: {
      sourceTerm: string;
      targetTerm: string;
      context?: string | null;
      domain?: string | null;
      definition?: string | null;
      usageNote?: string | null;
      partOfSpeech?: string | null;
      priority?: number;
    }[],
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const { data } = await apiClient.post<{
      imported: number;
      skipped: number;
      errors: string[];
    }>(API.glossaries.bulkTerms(glossaryId), { terms });
    return data;
  },

  async getTerms(glossaryId: string): Promise<GlossaryTermDto[]> {
    const { data } = await apiClient.get<GlossaryTermDto[]>(API.glossaries.terms(glossaryId));
    return data;
  },

  async updateTerm(glossaryId: string, termId: string, request: {
    sourceTerm: string;
    targetTerm: string;
    context?: string | null;
    domain?: string | null;
    definition?: string | null;
    usageNote?: string | null;
    partOfSpeech?: string | null;
    priority: number;
    isActive: boolean;
  }): Promise<void> {
    await apiClient.put(API.glossaries.termDetail(glossaryId, termId), request);
  },

  async deleteTerm(glossaryId: string, termId: string): Promise<void> {
    await apiClient.delete(API.glossaries.termDetail(glossaryId, termId));
  },

  async getPublishedGlobalTerms(): Promise<GlobalGlossaryTermDto[]> {
    const { data } = await apiClient.get<GlobalGlossaryTermDto[]>(API.glossaries.global);
    return data;
  },
};
