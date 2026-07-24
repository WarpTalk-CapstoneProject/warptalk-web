"use client";

import { useState } from "react";
import type { ElementType } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  CalendarBlank,
  FileText,
  Keyboard,
  Plus,
  Sparkle,
  SquaresFour,
  Users,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Lumidot } from "lumidot";
import { useUIStore } from "@/stores/ui-store";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { useTheme } from "next-themes";
import { useWorkspaceStore } from "@/stores/workspace-store";

type QuickSearchAction = {
  title: string;
  description: string;
  icon: ElementType;
  onSelect: () => void;
};

export function SearchMeetingDialog() {
  const router = useRouter();
  const searchMeetingModalOpen = useUIStore((state) => state.searchMeetingModalOpen);
  const setSearchMeetingModalOpen = useUIStore((state) => state.setSearchMeetingModalOpen);
  const setCreateRoomModalOpen = useUIStore((state) => state.setCreateRoomModalOpen);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const [searchQuery, setSearchQuery] = useState("");
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";
  const slug = activeWorkspaceSlug || "workspace";

  const { data, isLoading } = useTranslationRooms({
    search: searchQuery,
    pageSize: 10,
  });

  const meetings = data?.rooms || [];

  const handleSelect = (roomId: string) => {
    router.push(`/room/${roomId}`);
    setSearchMeetingModalOpen(false);
  };

  const closeAndRun = (action: () => void) => {
    setSearchMeetingModalOpen(false);
    action();
  };

  const quickActions: QuickSearchAction[] = [
    {
      title: "Create room",
      description: "Start a live translation room",
      icon: Plus,
      onSelect: () => closeAndRun(() => setCreateRoomModalOpen(true)),
    },
    {
      title: "Join by code",
      description: "Enter an invite or meeting code",
      icon: Keyboard,
      onSelect: () => closeAndRun(() => router.push("/join")),
    },
    {
      title: "Open meetings",
      description: "Browse scheduled and live rooms",
      icon: VideoCamera,
      onSelect: () => closeAndRun(() => router.push(`/${slug}/rooms`)),
    },
    {
      title: "AI summaries",
      description: "Review decisions and follow-ups",
      icon: Sparkle,
      onSelect: () => closeAndRun(() => router.push(`/${slug}/ai-summaries`)),
    },
    {
      title: "Documents",
      description: "Search workspace references",
      icon: FileText,
      onSelect: () => closeAndRun(() => router.push(`/${slug}/documents`)),
    },
    {
      title: "Members",
      description: "Open the workspace directory",
      icon: Users,
      onSelect: () => closeAndRun(() => router.push(`/${slug}/members`)),
    },
  ];

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <CommandDialog open={searchMeetingModalOpen} onOpenChange={setSearchMeetingModalOpen} className="max-w-[760px]">
      <Command className="rounded-xl p-0" shouldFilter={false}>
        <CommandInput
          placeholder="Search meetings, rooms, notes, or actions..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          autoFocus
        />
        <CommandList className="max-h-[560px] border-t border-border/70 p-2">
          <CommandGroup heading="Quick actions">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <CommandItem
                  key={action.title}
                  value={`action-${action.title}`}
                  onSelect={action.onSelect}
                  className="gap-3 rounded-[10px] px-3 py-2.5"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-muted group-data-selected/command-item:bg-primary/10 group-data-selected/command-item:text-primary">
                    <Icon size={19} weight="duotone" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold text-foreground">{action.title}</span>
                    <span className="mt-0.5 truncate text-[12px] text-muted-foreground">{action.description}</span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          {isLoading && (
            <div className="flex items-center justify-center gap-3 p-4 text-sm text-muted-foreground">
              <Lumidot variant={lumidotVariant} pattern="frame" glow={4} />
              <span>Searching meetings...</span>
            </div>
          )}

          {!isLoading && meetings.length > 0 && (
            <CommandGroup heading={hasQuery ? "Meetings" : "Recent meetings"} className="mt-1">
              {meetings.map((meeting) => (
                <CommandItem
                  key={meeting.id}
                  value={meeting.id}
                  onSelect={() => handleSelect(meeting.id)}
                  className="gap-3 rounded-[10px] px-3 py-2.5"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-muted">
                    <SquaresFour size={18} weight="duotone" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold text-foreground">{meeting.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 truncate text-[12px] text-muted-foreground">
                      <span className="bg-surface-2 border border-border px-1 rounded text-[10px] font-mono">{meeting.translationRoomCode}</span>
                      <span className="flex items-center gap-1"><CalendarBlank className="w-3 h-3" />{format(new Date(meeting.createdAt), "MMM d, yyyy")}</span>
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!isLoading && hasQuery && meetings.length === 0 && (
            <div className="py-8 text-center text-[13px] text-muted-foreground">
              No meetings found. Try a room title, code, or one of the quick actions above.
            </div>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
