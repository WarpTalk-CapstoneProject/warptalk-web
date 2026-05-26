import type { ReactNode } from "react";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-sidebar text-foreground">
      <WorkspaceSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-muted/30">
          <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
