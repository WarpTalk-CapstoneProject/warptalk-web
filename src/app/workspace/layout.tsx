import type { ReactNode } from "react";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <WorkspaceSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
