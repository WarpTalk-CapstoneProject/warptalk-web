"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SquaresFour,
  ClockCounterClockwise,
  Sparkle,
  BookBookmark,
  Waveform,
  GearSix,
  MagnifyingGlass,
  CaretDown,
  Plus,
  Keyboard,
} from "@phosphor-icons/react/dist/ssr";
import type { IconProps } from "@phosphor-icons/react";
type IconType = React.ElementType<IconProps>;
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaces } from "@/hooks/use-workspace";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NavItem {
  icon: IconType;
  label: string;
  href: string;
  actions?: Array<{
    icon: IconType;
    href?: string;
    onClick?: () => void;
    title?: string;
  }>;
}

const configNav: NavItem[] = [
  { icon: BookBookmark, label: "Terminology", href: "/terminology" },
  { icon: Waveform, label: "Voice Profiles", href: "/voice-profiles" },
  { icon: GearSix, label: "Settings", href: "/settings" },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <div className={cn(
        "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
        isActive ? "bg-surface-2" : "hover:bg-surface-2"
      )}>
      <Link href={item.href} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
        <item.icon size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
        <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">{item.label}</span>
      </Link>
      {item.actions && (
        <div className="flex items-center">
          {item.actions.map((action, i) => (
            action.onClick ? (
              <button 
                key={i}
                type="button"
                title={action.title}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-border/50 text-ink-muted hover:text-ink shrink-0 ml-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  action.onClick?.();
                }}
              >
                <action.icon size={14} weight="bold" />
              </button>
            ) : (
              <Link 
                key={i}
                href={action.href || "#"}
                title={action.title}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-border/50 text-ink-muted hover:text-ink shrink-0 ml-1"
                onClick={(e) => e.stopPropagation()}
              >
                <action.icon size={14} weight="bold" />
              </Link>
            )
          ))}
        </div>
      )}
    </div>
  );
}

export function LinearSidebar() {
  const pathname = usePathname();
  const setCreateRoomModalOpen = useUIStore((state) => state.setCreateRoomModalOpen);
  const setSearchMeetingModalOpen = useUIStore((state) => state.setSearchMeetingModalOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const { data: workspaces } = useWorkspaces();
  const currentWorkspace = workspaces?.[0];
  const workspaceName = currentWorkspace?.name || "Workspace";
  const workspaceInitials = workspaceName.substring(0, 2).toUpperCase();

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    setIsJoinModalOpen(false);
    router.push(`/join?code=${encodeURIComponent(trimmed)}`);
  }

  const mainNav: NavItem[] = [
    { 
      icon: SquaresFour, 
      label: "Meetings", 
      href: "/rooms", 
      actions: [
        { icon: Keyboard, onClick: () => setIsJoinModalOpen(true), title: "Join by code" },
        { icon: Plus, onClick: () => setCreateRoomModalOpen(true), title: "Create Meeting" }
      ] 
    },
    { icon: ClockCounterClockwise, label: "History", href: "/history" },
    { icon: Sparkle, label: "AI Summaries", href: "/ai-summaries" },
  ];

  return (
    <aside className="flex flex-col w-[224px] bg-canvas text-ink h-full shrink-0 select-none">
      {/* Workspace */}
      <div className="flex items-center justify-between px-3 h-[48px] shrink-0">
        <div className="flex items-center gap-2 hover:bg-surface-2 px-1.5 py-1 -ml-1.5 rounded-md cursor-pointer transition-colors min-w-0">
          <div className="w-[20px] h-[20px] rounded bg-pink-400 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white leading-none tracking-tight">{workspaceInitials}</span>
          </div>
          <span className="text-[14px] font-semibold text-ink truncate tracking-tight">{workspaceName}</span>
          <CaretDown size={12} className="text-ink-muted ml-1 shrink-0" weight="bold" />
        </div>
        <div className="flex items-center gap-1.5 text-ink-muted shrink-0">
          <button 
            onClick={() => setSearchMeetingModalOpen(true)}
            className="flex size-7 items-center justify-center rounded-[6px] hover:bg-surface-2 hover:text-ink transition-colors"
          >
            <MagnifyingGlass size={16} weight="regular" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3">
        <div className="flex flex-col gap-[2px]">
          {mainNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        <div className="mt-6 mb-1 px-2 flex items-center h-[24px]">
          <span className="text-[12px] font-medium text-ink-subtle">Workspace</span>
        </div>
        <div className="flex flex-col gap-px">
          {configNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      {/* User Account Panel */}
      {user && (
        <div className="p-3 mt-auto shrink-0">
          <div className="flex items-center gap-2.5 bg-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-border/50 p-2 rounded-xl cursor-pointer transition-colors group relative hover:shadow-md hover:border-border/80">
            <Avatar className="size-8 rounded-lg border border-border/50">
              <AvatarImage src={user.avatarUrl} alt={user.fullName} />
              <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-[13px] font-semibold">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[13px] font-medium text-ink truncate leading-tight">
                {user.fullName}
              </span>
              <span className="text-[11px] text-ink-muted truncate leading-tight mt-0.5">
                {user.email}
              </span>
            </div>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                logout();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink shrink-0 ml-1"
              title="Sign out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L204.69,120H104a8,8,0,0,0,0,16H204.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z"></path></svg>
            </button>
          </div>
        </div>
      )}

      {/* Join Room Dialog */}
      <Dialog open={isJoinModalOpen} onOpenChange={setIsJoinModalOpen}>
        <DialogContent className="sm:max-w-[425px] !top-[25%] !translate-y-[-25%]">
          <DialogHeader>
            <DialogTitle>Join Translation Room</DialogTitle>
            <DialogDescription>
              Enter the meeting code provided by your host to join the room.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleJoin} className="grid gap-4 pt-2">
            <div className="grid gap-2">
              <Label htmlFor="code" className="text-foreground font-medium text-[13px]">Meeting code</Label>
              <Input
                id="code"
                placeholder="e.g. ROOM-abc-123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                autoComplete="off"
                autoFocus
                className="bg-surface-1"
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button 
                type="submit" 
                disabled={!joinCode.trim()}
                className="disabled:bg-surface-2 disabled:text-ink-muted disabled:opacity-100 min-w-[80px] text-white"
              >
                Join
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
