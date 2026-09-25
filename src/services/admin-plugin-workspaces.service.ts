import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminPluginAvailabilityDto,
  AdminPluginWorkspaceRowDto,
  AdminPluginWorkspacesDto,
  AdminWorkspacePluginsDto,
  ApplyAdminPluginOverrideRequest,
  ApplyAdminPluginOverrideResultDto,
  SetAdminPluginAvailabilityRequest,
  SetAdminWorkspacePluginOverrideRequest,
} from "@/types/admin-plugin-workspaces";

/**
 * The platform admin's per-workspace plugin controls. Writes are audited server-side before they
 * commit; a 503 means the workspace service or the audit log did not answer and nothing changed.
 */
export const adminPluginWorkspacesService = {
  listForPlugin: async (pluginKey: string): Promise<AdminPluginWorkspacesDto> => {
    const { data } = await apiClient.get<AdminPluginWorkspacesDto>(
      API.adminPluginWorkspaceAccess.workspaces(pluginKey),
    );
    return data;
  },

  setAvailability: async (
    pluginKey: string,
    request: SetAdminPluginAvailabilityRequest,
  ): Promise<AdminPluginAvailabilityDto> => {
    const { data } = await apiClient.put<AdminPluginAvailabilityDto>(
      API.adminPluginWorkspaceAccess.availability(pluginKey),
      request,
    );
    return data;
  },

  applyOverride: async (
    pluginKey: string,
    request: ApplyAdminPluginOverrideRequest,
  ): Promise<ApplyAdminPluginOverrideResultDto> => {
    const { data } = await apiClient.post<ApplyAdminPluginOverrideResultDto>(
      API.adminPluginWorkspaceAccess.overrides(pluginKey),
      request,
    );
    return data;
  },

  listForWorkspace: async (workspaceId: string): Promise<AdminWorkspacePluginsDto> => {
    const { data } = await apiClient.get<AdminWorkspacePluginsDto>(
      API.adminPluginWorkspaceAccess.workspacePlugins(workspaceId),
    );
    return data;
  },

  setWorkspaceOverride: async (
    workspaceId: string,
    pluginKey: string,
    request: SetAdminWorkspacePluginOverrideRequest,
  ): Promise<AdminPluginWorkspaceRowDto> => {
    const { data } = await apiClient.put<AdminPluginWorkspaceRowDto>(
      API.adminPluginWorkspaceAccess.workspaceOverride(workspaceId, pluginKey),
      request,
    );
    return data;
  },
};
