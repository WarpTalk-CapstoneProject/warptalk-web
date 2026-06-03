"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BotMessageSquare,
  Building2,
  BookOpen,
  CircleHelp,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Moon,
  PanelLeft,
  Plus,
  Search,
  ServerCog,
  Sparkles,
  Star,
  TestTube2,
  type LucideIcon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  rooms: "Rooms",
  create: "Create Room",
  history: "History",
  "ai-summaries": "AI Summaries",
  "ai-chat": "AI Chat",
  feedback: "Feedback",
  terminology: "Terminology",
  settings: "Settings",
  workspace: "Workspace",
  admin: "Admin",
  "dev-test": "Dev Test",
};

const searchItems: Array<{
  title: string;
  url: string;
  group: string;
  icon: LucideIcon;
  shortcut?: string;
}> = [
  { title: "Dashboard", url: "/dashboard", group: "Workspace", icon: LayoutDashboard, shortcut: "D" },
  { title: "Rooms", url: "/rooms", group: "Workspace", icon: LayoutGrid, shortcut: "R" },
  { title: "Create Room", url: "/rooms/create", group: "Workspace", icon: Plus, shortcut: "N" },
  { title: "History & Transcripts", url: "/history", group: "Workspace", icon: FileText, shortcut: "H" },
  { title: "AI Summaries", url: "/ai-summaries", group: "AI", icon: Sparkles },
  { title: "Chat with AI", url: "/ai-chat", group: "AI", icon: BotMessageSquare },
  { title: "Terminology", url: "/terminology", group: "Configuration", icon: BookOpen },
  { title: "Post-room Feedback", url: "/feedback", group: "Operations", icon: Star },
  { title: "Workspace", url: "/workspace", group: "Administration", icon: Building2 },
  { title: "Admin", url: "/admin", group: "Administration", icon: ServerCog },
  { title: "Dev Test", url: "/dev-test", group: "Developer", icon: TestTube2 },
];

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const current = segments.at(-1);
  const label = current ? routeLabels[current] ?? current : "Dashboard";

  return (
    <div className="min-w-0">
      <h1 className="truncate text-xl font-semibold tracking-tight text-neutral-950">{label}</h1>
      <p className="text-[11px] text-neutral-500">WarpTalk workspace</p>
    </div>
  );
}

function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden h-7 w-full max-w-[240px] items-center gap-1.5 rounded-full border border-white/65 bg-white/72 px-2.5 text-xs text-neutral-500 shadow-[0_10px_20px_rgba(0,0,0,0.055)] backdrop-blur-[24px] transition hover:bg-white hover:text-neutral-950 md:flex"
    >
      <Search className="h-3 w-3" />
      <span className="flex-1 text-left">Search pages...</span>
      <kbd className="rounded-full border border-neutral-950/10 bg-neutral-950/5 px-1.5 font-mono text-[9px] text-neutral-500">Ctrl K</kbd>
    </button>
  );
}

function IconButton({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-neutral-950 shadow-[0_10px_20px_rgba(0,0,0,0.055)] transition hover:bg-white hover:text-neutral-950"
    >
      {children}
    </button>
  );
}

export function Topbar() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const groupedItems = useMemo(
    () =>
      searchItems.reduce<Record<string, typeof searchItems>>((groups, item) => {
        groups[item.group] = [...(groups[item.group] ?? []), item];
        return groups;
      }, {}),
    []
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = (url: string) => {
    router.push(url);
    setSearchOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[54px] shrink-0 items-center gap-1.5 bg-transparent px-1 text-neutral-950">
        <button
          type="button"
          aria-label="Toggle sidebar"
          title="Sidebar"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-neutral-950 shadow-[0_10px_20px_rgba(0,0,0,0.055)] transition hover:bg-white hover:text-neutral-950"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>
        <SearchTrigger onClick={() => setSearchOpen(true)} />
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Help">
            <CircleHelp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Notifications">
            <Bell className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Theme">
            <Moon className="h-3.5 w-3.5" />
          </IconButton>
          <div className="ml-1.5 flex h-7 items-center gap-1.5 rounded-full border border-white/65 bg-white/72 px-1.5 text-neutral-950 shadow-[0_10px_20px_rgba(0,0,0,0.055)] backdrop-blur-[24px]">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="bg-neutral-950 text-[10px] text-white">H</AvatarFallback>
            </Avatar>
            <span className="hidden text-xs font-medium sm:inline">Host</span>
          </div>
        </div>
      </header>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} className="max-w-[640px]">
        <Command className="rounded-xl">
          <CommandInput placeholder="Search WarpTalk pages..." autoFocus />
          <CommandList>
            <CommandEmpty>No page found.</CommandEmpty>
            {Object.entries(groupedItems).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((item) => (
                  <CommandItem key={item.url} value={item.title} onSelect={() => handleSelect(item.url)}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                    {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
