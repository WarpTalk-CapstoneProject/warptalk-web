"use client";

import Link from "next/link";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LinearSidebar } from "@/components/layout/linear-sidebar";
import {
  SignOut,
  Question,
  Bell,
  SidebarSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { CreateRoomDialog } from "@/components/rooms/create-room-dialog";
import { SearchMeetingDialog } from "@/components/rooms/search-meeting-dialog";

import { useTranslationRoom } from "@/hooks/use-translationRooms";

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);
  const { rightSidebarOpen, toggleRightSidebar } = useUIStore();

  const roomIdMatch = pathname.match(/^\/rooms\/([0-9a-fA-F-]{36})/);
  const roomId = roomIdMatch ? roomIdMatch[1] : undefined;
  const roomQuery = useTranslationRoom(roomId as string);
  const roomTitle = roomQuery.data?.title;

  return (
    <div className="relative h-dvh flex overflow-hidden bg-canvas text-ink">
      <LinearSidebar />
      
      {/* Main content */}
      <div className="relative flex flex-col flex-1 overflow-hidden my-1.5 mr-1.5 rounded-xl border border-border bg-surface-1 shadow-sm">
        {/* Top bar */}
        <header className="h-[44px] border-b border-border flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            {(() => {
              const parts: { label: string; href?: string }[] = [];
              if (pathname.startsWith('/rooms')) {
                parts.push({ label: "Meetings", href: "/rooms" });
                const sub = pathname.replace('/rooms', '').split('/').filter(Boolean)[0];
                if (sub) {
                  if (/^[0-9a-fA-F-]{36}$/.test(sub)) {
                    parts.push({ label: roomTitle || "Loading..." });
                  } else {
                    parts.push({ label: sub });
                  }
                }
              } else if (pathname.startsWith('/history')) {
                parts.push({ label: "History" });
              } else if (pathname.startsWith('/ai-summaries')) {
                parts.push({ label: "AI Summaries" });
              } else if (pathname.startsWith('/terminology')) {
                parts.push({ label: "Terminology" });
              } else if (pathname.startsWith('/voice-profiles')) {
                parts.push({ label: "Voice Profiles" });
              } else if (pathname.startsWith('/settings')) {
                parts.push({ label: "Settings" });
              } else if (pathname.startsWith('/join')) {
                parts.push({ label: "Join Translation Room" });
              } else if (pathname.startsWith('/room/')) {
                 parts.push({ label: "Meetings", href: "/rooms" });
                 const sub = pathname.replace('/room/', '').split('/').filter(Boolean)[0];
                 if (sub) {
                   if (/^[0-9a-fA-F-]{36}$/.test(sub)) {
                     parts.push({ label: roomTitle || "Loading..." });
                   } else {
                     parts.push({ label: sub });
                   }
                 }
              } else {
                parts.push({ label: "Workspace" });
              }

              return parts.map((part, index) => (
                <span key={index} className="flex items-center gap-1.5">
                  {part.href && index < parts.length - 1 ? (
                    <Link href={part.href} className="hover:text-ink cursor-pointer transition-colors">
                      {part.label}
                    </Link>
                  ) : (
                    <span className={index === parts.length - 1 ? "text-ink font-medium max-w-[300px] truncate" : "hover:text-ink cursor-pointer transition-colors capitalize"}>
                      {part.label}
                    </span>
                  )}
                  {index < parts.length - 1 && <span className="text-ink-muted/40">/</span>}
                </span>
              ));
            })()}
          </div>
          
          <div className="flex items-center gap-1.5 text-ink-muted">
            <button className="flex size-6 items-center justify-center rounded-full border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 hover:text-ink transition-colors"><Bell size={12} weight="bold" /></button>
            <button className="flex size-6 items-center justify-center rounded-full border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 hover:text-ink transition-colors"><Question size={12} weight="bold" /></button>
            <div className="w-[1px] h-3.5 bg-border mx-1" />
            <button 
              onClick={toggleRightSidebar}
              className="flex size-6 items-center justify-center rounded-[6px] border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 hover:text-ink transition-colors"
            >
              <SidebarSimple size={13} weight="bold" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
          
          {/* Right Sidebar (Context/Properties) */}
          {rightSidebarOpen && !pathname.startsWith('/room/') && !pathname.startsWith('/rooms/') && (
            <aside className="w-[260px] shrink-0 border-l border-border bg-surface-1 flex flex-col overflow-hidden">
              <div className="flex items-center px-4 h-[38px] border-b border-border">
                <span className="text-[12px] font-medium text-ink">Properties</span>
              </div>
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="text-[12px] text-ink-muted">
                  Select an item to view its properties and actions.
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
      <CreateRoomDialog />
      <SearchMeetingDialog />
    </div>
  );
}
