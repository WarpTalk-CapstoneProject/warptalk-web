"use client";

import Link from "next/link";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LinearSidebar } from "@/components/layout/linear-sidebar";
import {
  Question,
  SidebarSimple,
  Spinner,
} from "@phosphor-icons/react/dist/ssr";
import { useUIStore } from "@/stores/ui-store";
import { CreateRoomDialog } from "@/components/rooms/create-room-dialog";
import { SearchMeetingDialog } from "@/components/rooms/search-meeting-dialog";
import { SetupRoomModal } from "@/components/rooms/setup-room-modal";
import { GlobalChatbot } from "@/components/layout/global-chatbot";
import { NotificationPopover } from "@/components/notifications/notification-popover";
import { ThemeToggleButton } from "@/components/layout/theme-toggle-button";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { useTranslationRoom } from "@/hooks/use-translationRooms";
import { useWorkspaces, useSelectWorkspace } from "@/hooks/use-workspace";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    rightSidebarOpen,
    toggleRightSidebar,
    leftSidebarOpen,
    toggleLeftSidebar,
  } = useUIStore();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);

  const { data: workspacesData, isLoading: workspacesLoading } = useWorkspaces(1, 100);
  const selectWorkspace = useSelectWorkspace();

  const roomId = (() => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length >= 3 && segments[1] === 'rooms') {
      const id = segments[2];
      if (/^[0-9a-fA-F-]{36}$/.test(id)) return id;
    }
    if (segments.length >= 2 && segments[0] === 'room') {
      const id = segments[1];
      if (/^[0-9a-fA-F-]{36}$/.test(id)) return id;
    }
    return undefined;
  })();

  const roomQuery = useTranslationRoom(roomId ?? "");
  const roomTitle = roomId && roomQuery?.data ? roomQuery.data.title : undefined;

  const isOnboardingRoute =
    pathname === "/workspace" ||
    pathname === "/workspace/create" ||
    pathname === "/workspace/join";

  useEffect(() => {
    if (isOnboardingRoute || workspacesLoading) return;

    if (!activeWorkspaceId) {
      if (workspacesData?.items && workspacesData.items.length > 0) {
        const firstWs = workspacesData.items[0];
        const membershipType =
          "membershipType" in firstWs && typeof firstWs.membershipType === "string"
            ? firstWs.membershipType
            : "Internal";
        selectWorkspace.mutate(firstWs.id);
        setActiveWorkspace(
          firstWs.id,
          firstWs.name,
          firstWs.slug,
          firstWs.role || "Member",
          membershipType
        );
      } else {
        router.replace("/workspace");
      }
    }
  }, [activeWorkspaceId, workspacesData, workspacesLoading, isOnboardingRoute, selectWorkspace, setActiveWorkspace, router]);

  if (isOnboardingRoute) {
    return <>{children}</>;
  }

  if (!activeWorkspaceId || workspacesLoading) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <div className="relative h-dvh flex overflow-hidden bg-canvas text-ink">
      {leftSidebarOpen && <LinearSidebar />}
      {/* Main Column */}
      <div className="relative flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Main content box */}
        <div className="relative flex flex-col flex-1 overflow-hidden mt-1.5 mr-1.5 mb-0 rounded-xl border border-border bg-surface-1 shadow-sm">
          {/* Top bar */}
        <header className="h-[44px] border-b border-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 shrink-0">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-muted">
            <button
              onClick={toggleLeftSidebar}
              className="flex size-6 items-center justify-center rounded-[6px] border border-transparent hover:bg-surface-2 hover:text-ink transition-colors mr-1"
              title="Toggle Sidebar"
            >
              <SidebarSimple size={13} weight="bold" />
            </button>
            {(() => {
              const parts: { label: string; href?: string }[] = [];
              const segments = pathname.split('/').filter(Boolean);

              if (segments.length >= 1) {
                const firstSeg = segments[0];
                if (firstSeg === "voice-profiles") {
                  parts.push({ label: "Voice Profiles" });
                } else if (firstSeg === "join") {
                  parts.push({ label: "Join Translation Room" });
                } else if (firstSeg === "room") {
                  parts.push({ label: "Meetings", href: `/${activeWorkspaceSlug || "workspace"}/rooms` });
                  const rId = segments[1];
                  if (rId) {
                    parts.push({ label: roomTitle || "Loading..." });
                  }
                } else if (segments.length >= 2) {
                  const slug = firstSeg;
                  const feature = segments[1];

                  if (feature === "rooms") {
                    parts.push({ label: "Meetings", href: `/${slug}/rooms` });
                    const sub = segments[2];
                    if (sub) {
                      parts.push({ label: roomTitle || "Loading..." });
                    }
                  } else if (feature === "history") {
                    parts.push({ label: "History" });
                  } else if (feature === "ai-summaries") {
                    parts.push({ label: "Transcripts" });
                  } else if (feature === "dashboard") {
                    parts.push({ label: "Dashboard" });
                  } else if (feature === "home") {
                    parts.push({ label: "Home" });
                  } else if (feature === "members") {
                    parts.push({ label: "Members" });
                  } else if (feature === "documents") {
                    parts.push({ label: "Documents" });
                  } else if (feature === "settings") {
                    parts.push({ label: "Settings" });
                  } else if (feature === "billing") {
                    parts.push({ label: "Billing" });
                  } else if (feature === "payment") {
                    parts.push({ label: "Payment" });
                    const sub = segments[2];
                    if (sub) {
                      parts.push({ label: sub === "plans" ? "Plans" : sub });
                    }
                  } else {
                    parts.push({ label: feature });
                  }
                } else {
                  parts.push({ label: "Workspace" });
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

          <div className="flex items-center justify-end gap-1.5 text-ink-muted">
            <NotificationPopover />
            <button className="flex size-6 items-center justify-center rounded-full border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 hover:text-ink transition-colors"><Question size={12} weight="bold" /></button>
            <ThemeToggleButton />
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
        
        {/* Global Chatbot outside main content box */}
        <div className="shrink-0 mr-1.5">
          <GlobalChatbot />
        </div>
      </div>
      <CreateRoomDialog />
      <SearchMeetingDialog />
      <SetupRoomModal />
    </div>
  );
}
