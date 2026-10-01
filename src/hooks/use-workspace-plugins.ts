"use client";

import { useMemo } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ASSISTANT_KEYS } from "@/hooks/use-assistant";
import { collectMemberNames, collectMemberProfiles } from "@/lib/assistant/plugin-availability";
import { withWorkspaceToolRule } from "@/lib/assistant/tool-policy";
import { assistantService } from "@/services/assistant.service";
import { WorkspaceService } from "@/services/workspace.service";
import type {
  CreatePrivatePluginRequest,
  UpdatePrivatePluginRequest,
  WorkspaceToolPoliciesDto,
  WorkspaceToolRule,
} from "@/types/assistant";

/**
 * The workspace half of the plugin marketplace (2026-09-17): what a workspace has, private MCP
 * plugins, and members asking the Owner for more.
 *
 * Every write invalidates the member catalog too (`ASSISTANT_KEYS.pluginsRoot`), because the
 * catalog rows carry this workspace's `workspaceAvailability` and `requestStatus`.
 */
export const WORKSPACE_PLUGIN_KEYS = {
  root: ["assistant", "workspace-plugins"] as const,
  overview: (workspaceId: string | null | undefined) =>
    ["assistant", "workspace-plugins", workspaceId ?? null, "overview"] as const,
  members: (workspaceId: string | null | undefined, pluginKey: string | null | undefined) =>
    ["assistant", "workspace-plugins", workspaceId ?? null, "members", pluginKey ?? null] as const,
  toolPolicies: (workspaceId: string | null | undefined, pluginKey: string | null | undefined) =>
    ["assistant", "workspace-plugins", workspaceId ?? null, "tool-policies", pluginKey ?? null] as const,
};

function useInvalidateWorkspacePlugins() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: WORKSPACE_PLUGIN_KEYS.root });
    void queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.pluginsRoot });
  };
}

/**
 * Owner or Admin only. Pass `enabled: false` until the caller's role is known: a Member's request
 * is a guaranteed 403. The sidebar reads its pending-request badge from this same query.
 */
export function useWorkspacePlugins(workspaceId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: WORKSPACE_PLUGIN_KEYS.overview(workspaceId),
    queryFn: async () => {
      const { data } = await assistantService.getWorkspacePlugins(workspaceId!);
      return data;
    },
    enabled: enabled && !!workspaceId,
    staleTime: 30_000,
  });
}

export function useAddWorkspacePlugin(workspaceId: string | null | undefined) {
  const invalidate = useInvalidateWorkspacePlugins();
  return useMutation({
    mutationFn: async (pluginKey: string) => {
      const { data } = await assistantService.addWorkspacePlugin(workspaceId!, pluginKey);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveWorkspacePlugin(workspaceId: string | null | undefined) {
  const invalidate = useInvalidateWorkspacePlugins();
  return useMutation({
    mutationFn: async (pluginKey: string) => {
      await assistantService.removeWorkspacePlugin(workspaceId!, pluginKey);
    },
    onSuccess: invalidate,
  });
}

export function useCreatePrivatePlugin(workspaceId: string | null | undefined) {
  const invalidate = useInvalidateWorkspacePlugins();
  return useMutation({
    mutationFn: async (request: CreatePrivatePluginRequest) => {
      const { data } = await assistantService.createPrivatePlugin(workspaceId!, request);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePrivatePlugin(workspaceId: string | null | undefined) {
  const invalidate = useInvalidateWorkspacePlugins();
  return useMutation({
    mutationFn: async ({ pluginKey, request }: { pluginKey: string; request: UpdatePrivatePluginRequest }) => {
      const { data } = await assistantService.updatePrivatePlugin(workspaceId!, pluginKey, request);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Any active member. */
export function useRequestPlugin(workspaceId: string | null | undefined) {
  const invalidate = useInvalidateWorkspacePlugins();
  return useMutation({
    mutationFn: async ({ pluginKey, reason }: { pluginKey: string; reason?: string }) => {
      const { data } = await assistantService.requestPlugin(workspaceId!, pluginKey, reason);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDecidePluginRequest(workspaceId: string | null | undefined) {
  const invalidate = useInvalidateWorkspacePlugins();
  return useMutation({
    mutationFn: async ({ requestId, decision }: { requestId: string; decision: "approve" | "decline" }) => {
      const { data } =
        decision === "approve"
          ? await assistantService.approvePluginRequest(workspaceId!, requestId)
          : await assistantService.declinePluginRequest(workspaceId!, requestId);
      return data;
    },
    onSuccess: invalidate,
  });
}

/**
 * Display names for the members the owner page mentions — who asked for a plugin, who added one.
 *
 * Not `useWorkspaceMembers(id, 1, 100)`: that is the first hundred members, and every request from
 * anyone after them read "A member asked for…". This pages through the member list until each id is
 * found (see `collectMemberNames`). Keyed under the member list's own prefix, so a member change
 * that invalidates the list invalidates this too.
 */
export function useWorkspaceMemberNames(
  workspaceId: string | null | undefined,
  userIds: readonly (string | null | undefined)[],
  enabled: boolean,
) {
  const idsKey = useMemo(
    () => [...new Set(userIds.filter((id): id is string => !!id))].sort().join(","),
    [userIds],
  );
  return useQuery({
    queryKey: ["workspaces", "members", workspaceId ?? "", "names", idsKey] as const,
    queryFn: () =>
      collectMemberNames(idsKey.split(","), (page, pageSize) =>
        WorkspaceService.listMembers(workspaceId!, page, pageSize),
      ),
    enabled: enabled && !!workspaceId && idsKey.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * The workspace's members who have connected one plugin — the Manage dialog's "who uses this".
 * Owner or Admin: pass `enabled: false` for anyone else, whose request is a guaranteed 403.
 */
export function useWorkspacePluginMembers(
  workspaceId: string | null | undefined,
  pluginKey: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: WORKSPACE_PLUGIN_KEYS.members(workspaceId, pluginKey),
    queryFn: async () => {
      const { data } = await assistantService.listWorkspacePluginMembers(workspaceId!, pluginKey!);
      return data;
    },
    enabled: enabled && !!workspaceId && !!pluginKey,
    staleTime: 30_000,
  });
}

/**
 * Names and avatars for members the Manage dialog lists. The same member-list walk as
 * `useWorkspaceMemberNames`, keyed under the member list's prefix so a member change refreshes it.
 */
export function useWorkspaceMemberProfiles(
  workspaceId: string | null | undefined,
  userIds: readonly (string | null | undefined)[],
  enabled: boolean,
) {
  const idsKey = useMemo(
    () => [...new Set(userIds.filter((id): id is string => !!id))].sort().join(","),
    [userIds],
  );
  return useQuery({
    queryKey: ["workspaces", "members", workspaceId ?? "", "profiles", idsKey] as const,
    queryFn: () =>
      collectMemberProfiles(idsKey.split(","), (page, pageSize) =>
        WorkspaceService.listMembers(workspaceId!, page, pageSize),
      ),
    enabled: enabled && !!workspaceId && idsKey.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * The plugin's tools with the workspace Owner's rule for each (wave 2). Owner or Admin: pass
 * `enabled: false` for anyone else, whose request is a guaranteed 403.
 */
export function useWorkspaceToolPolicies(
  workspaceId: string | null | undefined,
  pluginKey: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: WORKSPACE_PLUGIN_KEYS.toolPolicies(workspaceId, pluginKey),
    queryFn: async () => {
      const { data } = await assistantService.getWorkspaceToolPolicies(workspaceId!, pluginKey!);
      return data;
    },
    enabled: enabled && !!workspaceId && !!pluginKey,
    staleTime: 30_000,
  });
}

/**
 * Sets or clears one tool's workspace rule. Owner. Optimistic: the row moves at once and moves back
 * if the server refuses, so the caller only has to say so (a toast). The member catalog is
 * invalidated on success because every member's tools carry `workspacePolicy`.
 */
export function useSetWorkspaceToolPolicy(
  workspaceId: string | null | undefined,
  pluginKey: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const queryKey = WORKSPACE_PLUGIN_KEYS.toolPolicies(workspaceId, pluginKey);
  return useMutation({
    mutationFn: async ({ toolName, policy }: { toolName: string; policy: WorkspaceToolRule | null }) => {
      const { data } = await assistantService.setWorkspaceToolPolicy(workspaceId!, pluginKey!, { toolName, policy });
      return data;
    },
    onMutate: async ({ toolName, policy }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<WorkspaceToolPoliciesDto>(queryKey);
      if (previous) {
        queryClient.setQueryData<WorkspaceToolPoliciesDto>(queryKey, withWorkspaceToolRule(previous, toolName, policy));
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({ queryKey: ASSISTANT_KEYS.pluginsRoot });
    },
  });
}
