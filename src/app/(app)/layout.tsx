"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LinearSidebar } from "@/components/layout/linear-sidebar";
import {
  MagnifyingGlass,
  PencilSimple,
  Star,
  DotsThree,
  Bell,
  Question,
  SidebarSimple,
} from "@phosphor-icons/react/dist/ssr";

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMeetingSurface = pathname.startsWith("/room/");
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);



  return (
    <div className="relative h-dvh flex overflow-hidden bg-canvas text-ink">
      <LinearSidebar />
      
      {/* Main content */}
      <div className="relative flex flex-col flex-1 overflow-hidden my-1.5 mr-1.5 rounded-xl border border-border bg-surface-1 shadow-sm">
        {/* Top bar */}
        <header className="h-[44px] border-b border-border flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            {(() => {
              const parts: string[] = [];
              if (pathname.startsWith('/rooms')) {
                parts.push("Meetings");
                const sub = pathname.replace('/rooms', '').split('/').filter(Boolean)[0];
                if (sub) parts.push(sub);
              } else if (pathname.startsWith('/history')) {
                parts.push("History");
              } else if (pathname.startsWith('/ai-summaries')) {
                parts.push("AI Summaries");
              } else if (pathname.startsWith('/terminology')) {
                parts.push("Terminology");
              } else if (pathname.startsWith('/voice-profiles')) {
                parts.push("Voice Profiles");
              } else if (pathname.startsWith('/settings')) {
                parts.push("Settings");
              } else if (pathname.startsWith('/room/')) {
                 parts.push("Meetings");
                 const sub = pathname.replace('/room/', '').split('/').filter(Boolean)[0];
                 if (sub) parts.push(sub);
              } else {
                parts.push("Workspace");
              }

              return parts.map((part, index) => (
                <span key={index} className="flex items-center gap-1.5">
                  <span className={index === parts.length - 1 ? "text-ink font-medium" : "hover:text-ink cursor-pointer transition-colors"}>
                    {part}
                  </span>
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
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
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
          {rightSidebarOpen && (
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
    </div>
  );
}
