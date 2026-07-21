"use client";

import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function WorkspaceAdminDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-10 scrollbar-hide bg-canvas text-ink">
      <div className="max-w-7xl mx-auto space-y-6 w-full">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {activeWorkspaceName} Dashboard
        </h1>
        <p className="text-ink-muted">
          This dashboard is only visible to workspace owners and admins.
        </p>
      </div>
    </div>
  );
}
