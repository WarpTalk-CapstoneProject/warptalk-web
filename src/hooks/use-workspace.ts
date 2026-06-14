import { useQuery } from "@tanstack/react-query";
import { workspaceService } from "@/services/workspace.service";

export const useWorkspaces = () => {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: () => workspaceService.getWorkspaces(),
  });
};

export const useWorkspaceMembers = (workspaceId: string | undefined) => {
  return useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => workspaceService.getWorkspaceMembers(workspaceId!),
    enabled: !!workspaceId,
  });
};
