"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HostSidebar } from "@/components/layout/host-sidebar";
import { ParticipantSidebar } from "@/components/layout/participant-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuthStore } from "@/stores/auth-store";

export default function AppLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const isMeetingSurface = pathname.startsWith("/room/");

  if (isMeetingSurface) {
    return <main className="min-h-screen overflow-hidden bg-white">{children}</main>;
  }

  // Default to Host sidebar if role is not strictly participant-only
  const isParticipantOnly = user?.roles?.includes("participant") && !user?.roles?.includes("host");

  return (
    <div className="flex h-screen overflow-hidden">
      {isParticipantOnly ? <ParticipantSidebar /> : <HostSidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
