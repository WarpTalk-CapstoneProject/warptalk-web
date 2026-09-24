import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { ChatAttachment } from "@/lib/assistant/attachments";
import type {
  AssistantConversationDetailDto,
  AssistantConversationDto,
  AssistantMentionDto,
  AssistantPageContextDto,
  AssistantPluginCatalogItemDto,
  AssistantSkillDto,
  CreateAssistantConversationOptions,
  CreatePrivatePluginRequest,
  PluginConnectResultDto,
  PluginToolPolicy,
  SendAssistantMessageResponse,
  UpdatePrivatePluginRequest,
  WorkspacePluginItemDto,
  WorkspacePluginRequestDto,
  WorkspacePluginsOverviewDto,
  WorkspacePluginToolAuditDto,
  WorkspacePluginToolAuditQuery,
} from "@/types/assistant";

export const assistantService = {
  listConversations(workspaceId: string) {
    return apiClient.get<AssistantConversationDto[]>(API.assistant.conversations, {
      params: { workspaceId },
    });
  },

  getConversation(id: string) {
    return apiClient.get<AssistantConversationDetailDto>(API.assistant.conversation(id));
  },

  createConversation(workspaceId: string, options?: CreateAssistantConversationOptions) {
    return apiClient.post<AssistantConversationDto>(API.assistant.conversations, {
      workspaceId,
      ...(options?.title ? { title: options.title } : {}),
      ...(options?.seedMessages?.length ? { seedMessages: options.seedMessages } : {}),
    });
  },

  sendMessage(
    conversationId: string,
    content: string,
    pageContext?: AssistantPageContextDto | null,
    mentions?: AssistantMentionDto[],
    /**
     * WT-474 — files pasted, picked or dropped into the composer: images AND documents.
     *
     * They belong to THIS TURN. Nothing stores them, so a follow-up question cannot see them — the
     * composer says so, because a user who attaches once and then asks "and the red box?" would
     * otherwise get a confident answer about a file the model never received.
     *
     * `size` is dropped on the way out: it is only there for the chip's label.
     */
    attachments?: ChatAttachment[],
    /**
     * WT-687 — plugins switched off for this conversation. WarpBot is not offered their tools this
     * turn. Omitted when every plugin is on, which is what an older client sends.
     */
    disabledPluginKeys?: string[]
  ) {
    return apiClient.post<SendAssistantMessageResponse>(API.assistant.sendMessage(conversationId), {
      content,
      pageContext: pageContext ?? undefined,
      mentions: mentions?.length ? mentions : undefined,
      attachments: attachments?.length
        ? attachments.map(({ dataUrl, name, mimeType }) => ({ dataUrl, name, mimeType }))
        : undefined,
      disabledPluginKeys: disabledPluginKeys?.length ? disabledPluginKeys : undefined,
    });
  },

  archiveConversation(id: string) {
    return apiClient.delete<void>(API.assistant.conversation(id));
  },

  getSkills() {
    return apiClient.get<AssistantSkillDto[]>(API.assistant.skills);
  },

  /**
   * WT-646 — `workspaceId` is optional at the endpoint and it changes what comes back, not which
   * rows come back: supplied, every row carries that workspace's verdict in
   * `workspacePolicyBlockReason`; omitted, no workspace policy is applied at all and the field is
   * always absent.
   *
   * The catalog itself stays personal either way. A plugin is installed and connected by a person,
   * not by a workspace, and the workspace only gets to say whether its members may use plugins here
   * — so this names the workspace the user is browsing from rather than scoping the list to it.
   */
  listPlugins(workspaceId?: string | null) {
    return apiClient.get<AssistantPluginCatalogItemDto[]>(API.assistant.plugins, {
      params: workspaceId ? { workspaceId } : undefined,
    });
  },

  /**
   * `workspaceId` is what makes the refusal real rather than advisory: without it the server
   * applies no policy and installs a plugin the page has just told the user their workspace does
   * not permit.
   */
  installPlugin(pluginKey: string, workspaceId?: string | null) {
    return apiClient.post<AssistantPluginCatalogItemDto>(
      API.assistant.installPlugin(pluginKey),
      undefined,
      { params: workspaceId ? { workspaceId } : undefined },
    );
  },

  /**
   * Connects a plugin. When the provider's grant already covers it the server connects it on the
   * spot and answers `connected: true` without a URL; otherwise it answers with the consent URL.
   */
  connectPlugin(pluginKey: string, client?: string, workspaceId?: string | null) {
    return apiClient.post<PluginConnectResultDto>(API.assistant.pluginConnect(pluginKey, client), undefined, {
      params: workspaceId ? { workspaceId } : undefined,
    });
  },

  /** Answers with the catalog row. The key is checked against the MCP server and never sent back. */
  connectPluginWithApiKey(pluginKey: string, apiKey: string, workspaceId?: string | null) {
    return apiClient.post<AssistantPluginCatalogItemDto>(
      API.assistant.pluginApiKey(pluginKey),
      { apiKey },
      { params: workspaceId ? { workspaceId } : undefined },
    );
  },

  disconnectPlugin(pluginKey: string) {
    return apiClient.delete<void>(API.assistant.pluginConnection(pluginKey));
  },

  disablePlugin(pluginKey: string) {
    return apiClient.delete<void>(API.assistant.disablePlugin(pluginKey));
  },

  /**
   * WT-687 — what WarpBot may do with each named tool, for this user. Tools left out keep their
   * choice. Answers with the catalog row, whose tools carry the resolved `policy`.
   */
  // ---- workspace plugin marketplace (2026-09-17) ------------------------------------------------

  getWorkspacePlugins(workspaceId: string) {
    return apiClient.get<WorkspacePluginsOverviewDto>(API.assistant.workspacePlugins.base(workspaceId));
  },

  addWorkspacePlugin(workspaceId: string, pluginKey: string) {
    return apiClient.post<WorkspacePluginItemDto>(API.assistant.workspacePlugins.marketplace(workspaceId, pluginKey));
  },

  /** Removes a marketplace plugin from the workspace; a private plugin is retired. */
  removeWorkspacePlugin(workspaceId: string, pluginKey: string) {
    return apiClient.delete<void>(API.assistant.workspacePlugins.plugin(workspaceId, pluginKey));
  },

  createPrivatePlugin(workspaceId: string, request: CreatePrivatePluginRequest) {
    return apiClient.post<WorkspacePluginItemDto>(API.assistant.workspacePlugins.private(workspaceId), request);
  },

  updatePrivatePlugin(workspaceId: string, pluginKey: string, request: UpdatePrivatePluginRequest) {
    return apiClient.patch<WorkspacePluginItemDto>(
      API.assistant.workspacePlugins.privatePlugin(workspaceId, pluginKey),
      request,
    );
  },

  listPendingPluginRequests(workspaceId: string) {
    return apiClient.get<WorkspacePluginRequestDto[]>(API.assistant.workspacePlugins.requests(workspaceId));
  },

  requestPlugin(workspaceId: string, pluginKey: string, reason?: string) {
    return apiClient.post<WorkspacePluginRequestDto>(API.assistant.workspacePlugins.requests(workspaceId), {
      pluginKey,
      reason: reason?.trim() ? reason.trim() : undefined,
    });
  },

  approvePluginRequest(workspaceId: string, requestId: string) {
    return apiClient.post<WorkspacePluginRequestDto>(
      API.assistant.workspacePlugins.approveRequest(workspaceId, requestId),
    );
  },

  declinePluginRequest(workspaceId: string, requestId: string) {
    return apiClient.post<WorkspacePluginRequestDto>(
      API.assistant.workspacePlugins.declineRequest(workspaceId, requestId),
    );
  },

  updatePluginToolPolicy(pluginKey: string, tools: Record<string, PluginToolPolicy>) {
    return apiClient.put<AssistantPluginCatalogItemDto>(API.assistant.pluginToolPolicy(pluginKey), { tools });
  },

  /**
   * The workspace's plugin activity log. A plain array, not a paged envelope: the server returns
   * no total, so a caller learns there is another page only by getting a full one back.
   * Absent filters are left off the query string rather than sent empty.
   */
  listWorkspacePluginToolAudits(query: WorkspacePluginToolAuditQuery) {
    return apiClient.get<WorkspacePluginToolAuditDto[]>(API.assistant.workspacePluginToolAudits, {
      params: {
        workspaceId: query.workspaceId,
        skip: query.skip,
        take: query.take,
        ...(query.pluginKey ? { pluginKey: query.pluginKey } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
      },
    });
  },
};
