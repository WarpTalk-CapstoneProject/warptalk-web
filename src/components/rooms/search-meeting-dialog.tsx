"use client";

import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { motion } from "motion/react";
import {
  CalendarBlank,
  FileText,
  Keyboard,
  MagnifyingGlass,
  Plus,
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
import { looksLikeRoomCode } from "@/lib/meeting/room-code-guess";
import { useUIStore } from "@/stores/ui-store";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { useTheme } from "next-themes";
import { useCanCreateMeetings, useWorkspaceStore } from "@/stores/workspace-store";
import { liveMeetingPath } from "@/lib/workspace/workspace-routes";

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
  const canCreateMeetings = useCanCreateMeetings();
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const [searchQuery, setSearchQuery] = useState("");
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";
  const slug = activeWorkspaceSlug || "workspace";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchMeetingModalOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setSearchMeetingModalOpen]);

  // Reopening must not resume the last search. Left as-is, a code typed earlier is still in
  // the box on the next ⌘K with "Join meeting <that code>" selected, so Enter — the one key
  // someone reaches for — sends them into a room they did not ask for.
  //
  // Keyed off the open flag rather than cleared inside onOpenChange, because selecting a
  // result closes the dialog by calling the store setter directly; that path never reaches
  // onOpenChange, and it is the path most likely to leave a code behind. Adjusting during
  // render rather than in an effect is React's own answer to "reset state when a value
  // changes" — an effect would paint the stale query for a frame first.
  const [wasOpen, setWasOpen] = useState(searchMeetingModalOpen);
  if (wasOpen !== searchMeetingModalOpen) {
    setWasOpen(searchMeetingModalOpen);
    if (!searchMeetingModalOpen) setSearchQuery("");
  }

  const { data, isLoading } = useTranslationRooms({
    search: searchQuery,
    pageSize: 10,
  });

  const meetings = data?.rooms || [];

  const handleSelect = (roomId: string) => {
    router.push(liveMeetingPath(activeWorkspaceSlug, roomId));
    setSearchMeetingModalOpen(false);
  };

  const closeAndRun = (action: () => void) => {
    setSearchMeetingModalOpen(false);
    action();
  };

  const quickActions: QuickSearchAction[] = [
    // WT-371 #2: the command palette is a second door to the same dialog. Leaving it open for a
    // member who cannot create meetings would mean the buttons are hidden and Ctrl-K still works.
    ...(canCreateMeetings
      ? [
          {
            title: "Create room",
            description: "Start a live translation room",
            icon: Plus,
            onSelect: () => closeAndRun(() => setCreateRoomModalOpen(true)),
          } satisfies QuickSearchAction,
        ]
      : []),
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

  // Someone who has just pasted a code wants one thing, so it goes above the quick actions
  // rather than below the meeting results — the room may not be in this workspace's list at
  // all, and waiting for that search to come back empty is not a useful answer.
  const pastedCode = searchQuery.trim();
  const showQuickJoin = looksLikeRoomCode(pastedCode);

  return (
    <CommandDialog
      open={searchMeetingModalOpen}
      onOpenChange={setSearchMeetingModalOpen}
      className="top-1/2 !max-w-[640px] -translate-y-1/2 overflow-visible border-0 bg-transparent p-0 ring-0 shadow-none sm:max-w-[640px]"
      showCloseButton={false}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="overflow-hidden rounded-[22px] border border-border bg-popover/96 text-popover-foreground shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl dark:shadow-[0_24px_90px_rgba(0,0,0,0.65)]"
      >
        <Command className="rounded-[22px] bg-transparent p-0" shouldFilter={false}>
          <div className="p-3">
            <div className="flex h-12 items-center gap-3 rounded-full border border-border bg-surface-1 px-4 shadow-[0_16px_50px_rgba(0,0,0,0.10)]">
              <MagnifyingGlass size={18} weight="regular" className="shrink-0 text-ink-muted" />
              <CommandInput
                placeholder="Search commands..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                autoFocus
                wrapperClassName="flex-1 p-0"
                inputGroupClassName="h-full! border-0 bg-transparent p-0 shadow-none! ring-0"
                showIcon={false}
                className="h-full text-[15px] placeholder:text-ink-muted"
              />
              <kbd className="ml-auto shrink-0 rounded-full border border-border bg-canvas px-2 py-1 text-[11px] font-medium text-ink-subtle">
                ⌘K
              </kbd>
            </div>
          </div>

          <CommandList className="max-h-[460px] border-t border-border/70 px-2 pb-2 pt-1">
            {showQuickJoin && (
              <CommandGroup heading="Join a meeting">
                <CommandItem
                  value={`join-${pastedCode}`}
                  onSelect={() =>
                    closeAndRun(() => router.push(`/join?code=${encodeURIComponent(pastedCode)}`))
                  }
                  className="gap-3 rounded-[10px] px-3 py-2.5"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-muted group-data-selected/command-item:bg-primary/10 group-data-selected/command-item:text-primary">
                    <VideoCamera size={19} weight="duotone" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold text-foreground">
                      Join meeting <span className="font-mono">{pastedCode}</span>
                    </span>
                    <span className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      Go straight to the room with this code
                    </span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

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
      </motion.div>
    </CommandDialog>
  );
}
