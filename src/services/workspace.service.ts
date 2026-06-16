import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { Workspace, WorkspaceMember } from "@/types/workspace";

export const workspaceService = {
  getWorkspaces: async (): Promise<Workspace[]> => {
    const response = await apiClient.get<any>(API.workspaces.list);
    return response.data.items || response.data || [];
  },

  getWorkspace: async (id: string): Promise<Workspace> => {
    // API call for single workspace if exists, otherwise fallback to finding in list
    const response = await apiClient.get<any>(API.workspaces.list);
    const list = response.data.items || response.data || [];
    return list.find((w: Workspace) => w.id === id) || list[0];
  },

  getWorkspaceMembers: async (workspaceId: string): Promise<WorkspaceMember[]> => {
    const response = await apiClient.get<any>(API.workspaces.members(workspaceId));
    return response.data.items || response.data || [];
  },
};
