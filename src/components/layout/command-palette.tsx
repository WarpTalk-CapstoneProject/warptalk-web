"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  FileText,
  GearSix,
  MagnifyingGlass,
  Microphone,
  Plus,
  Question,
  Scroll,
  SquaresFour,
  Star,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { looksLikeRoomCode } from "@/lib/room-code-guess";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * The workspace search, back in the header where it was.
 *
 * It had not been "removed" so much as orphaned: the whole Topbar component that owned it
 * was never rendered by any layout, so its command palette and its Ctrl-K handler sat in the
 * repo doing nothing. This is that palette, mounted somewhere it actually runs, plus the
 * thing it could not do before — take a room code and go straight into the meeting.
 */

type NavItem = {
  title: string;
  url: string;
  group: string;
  icon: React.ElementType;
  shortcut?: string;
};

/**
 * Carried over from the orphaned Topbar, with two titles repaired. They read "MagnifyingGlass
 * pages…" and "GearSix" — a find/replace that swapped words for the icon names that happened
 * to sit beside them. The same edit is why the browser tab said "TranslationRoom Translation"
 * until tonight.
 */
const NAV_ITEMS: NavItem[] = [
  { title: "Meetings", url: "/rooms", group: "Workspace", icon: SquaresFour, shortcut: "R" },
  { title: "Create room", url: "/rooms/create", group: "Workspace", icon: Plus, shortcut: "N" },
  { title: "History & transcripts", url: "/history", group: "Workspace", icon: FileText, shortcut: "H" },
  { title: "Members", url: "/members", group: "Workspace", icon: SquaresFour },
  { title: "Transcripts", url: "/ai-summaries", group: "AI", icon: Scroll },
  { title: "Chat with AI", url: "/ai-chat", group: "AI", icon: Question },
  { title: "Terminology", url: "/terminology", group: "Configuration", icon: BookOpen },
  { title: "Voice profiles", url: "/voice-profiles", group: "Configuration", icon: Microphone },
  { title: "Settings", url: "/settings", group: "Configuration", icon: GearSix },
  { title: "Post-room feedback", url: "/feedback", group: "Operations", icon: Star },
];

/** Routes that live under /{workspaceSlug}. Everything else is app-absolute. */
const WORKSPACE_SCOPED_PREFIXES = ["/rooms", "/history", "/ai-summaries", "/members", "/terminology", "/settings"];

export function CommandPalette() {
  const router = useRouter();
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const grouped = useMemo(
    () =>
      NAV_ITEMS.reduce<Record<string, NavItem[]>>((groups, item) => {
        groups[item.group] = [...(groups[item.group] ?? []), item];
        return groups;
      }, {}),
    [],
  );

  const roomCode = query.trim();
  const showQuickJoin = looksLikeRoomCode(roomCode);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function navigate(url: string) {
    const slug = activeWorkspaceSlug || "workspace";
    const scoped = WORKSPACE_SCOPED_PREFIXES.some(
      (prefix) => url === prefix || url.startsWith(`${prefix}/`),
    );
    router.push(scoped ? `/${slug}${url}` : url);
    close();
  }

  function joinByCode(code: string) {
    router.push(`/join?code=${encodeURIComponent(code)}`);
    close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search, or enter a room code"
        className="hidden h-7 w-full max-w-[420px] items-center gap-2 rounded-md border border-border bg-surface-1 px-2.5 text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink md:flex"
      >
        <MagnifyingGlass weight="light" className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">Search, or paste a room code</span>
        <kbd className="rounded-sm bg-surface-2 px-1.5 font-mono text-[10px] text-ink-muted">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <CommandInput
          placeholder="Search pages, or paste a room code…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Nothing matched that.</CommandEmpty>

          {/*
            First in the list, because someone who just pasted a code wants exactly one thing
            and it is not a settings page. A code fuzzy-matches no nav item, so this ends up
            the only result and Enter takes it.
          */}
          {showQuickJoin ? (
            <>
              <CommandGroup heading="Join a meeting">
                <CommandItem
                  value={`join-${roomCode}`}
                  onSelect={() => joinByCode(roomCode)}
                >
                  <VideoCamera weight="light" />
                  <span>
                    Join meeting <span className="font-mono">{roomCode}</span>
                  </span>
                  <CommandShortcut>
                    <ArrowRight weight="bold" className="h-3.5 w-3.5" />
                  </CommandShortcut>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          {Object.entries(grouped).map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.url}
                    value={`${item.title} ${item.group}`}
                    onSelect={() => navigate(item.url)}
                  >
                    <Icon weight="light" />
                    <span>{item.title}</span>
                    {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
