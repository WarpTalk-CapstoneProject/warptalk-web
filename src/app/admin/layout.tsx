import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-sidebar text-foreground">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-muted/30">
          <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
