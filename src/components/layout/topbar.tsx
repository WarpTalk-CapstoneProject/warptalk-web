"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BotMessageSquare,
  Building2,
  ChevronRight,
  CircleHelp,
  BookOpen,
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
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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

  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm">
      <span className="font-medium text-white/58">WarpTalk</span>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-4 w-4 shrink-0 text-white/28" />
            <span className={cn("truncate", isLast ? "font-medium text-white" : "text-white/52")}>
              {routeLabels[segment] ?? segment}
            </span>
          </span>
        );
      })}
    </nav>
  );
}

function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden h-8 w-full max-w-[280px] items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.035] px-3 text-sm text-white/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition hover:bg-white/[0.06] hover:text-white/72 md:flex"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Search pages...</span>
      <kbd className="rounded border border-white/10 bg-white/8 px-1.5 font-mono text-[10px] text-white/42">Ctrl K</kbd>
    </button>
  );
}

function IconButton({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/58 transition hover:bg-white/8 hover:text-white"
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
      <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-white/[0.125] bg-[rgba(143,143,143,0.1)] px-4 text-white backdrop-blur-[10px] backdrop-saturate-200 lg:px-5">
        <button
          type="button"
          aria-label="Toggle sidebar"
          title="Sidebar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/58 transition hover:bg-white/8 hover:text-white"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <Separator orientation="vertical" className="mx-1 h-4 bg-white/12" />
        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>
        <SearchTrigger onClick={() => setSearchOpen(true)} />
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Help">
            <CircleHelp className="h-4 w-4" />
          </IconButton>
          <IconButton label="Notifications">
            <Bell className="h-4 w-4" />
          </IconButton>
          <IconButton label="Theme">
            <Moon className="h-4 w-4" />
          </IconButton>
          <div className="ml-2 flex h-8 items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.035] px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-white text-xs text-black">H</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:inline">Host</span>
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
