import type { ReactNode } from "react";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-screen overflow-hidden bg-canvas text-ink flex">
      <WorkspaceSidebar />
      <div className="relative z-[2] flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
