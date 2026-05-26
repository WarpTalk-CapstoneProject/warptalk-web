"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BotMessageSquare,
  Building2,
  ChevronRight,
  CircleHelp,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Link2,
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
  settings: "Settings",
  join: "Join",
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
  { title: "Post-room Feedback", url: "/feedback", group: "Operations", icon: Star },
  { title: "Join Room", url: "/join", group: "Operations", icon: Link2 },
  { title: "Workspace", url: "/workspace", group: "Administration", icon: Building2 },
  { title: "Admin", url: "/admin", group: "Administration", icon: ServerCog },
  { title: "Dev Test", url: "/dev-test", group: "Developer", icon: TestTube2 },
];

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm">
      <span className="font-medium text-foreground">WarpTalk</span>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={cn("truncate", isLast ? "font-medium text-foreground" : "text-muted-foreground")}>
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
      className="hidden h-8 w-full max-w-[280px] items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground shadow-xs transition hover:bg-muted md:flex"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Search pages...</span>
      <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">Ctrl K</kbd>
    </button>
  );
}

function IconButton({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
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
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
        <button
          type="button"
          aria-label="Toggle sidebar"
          title="Sidebar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <Separator orientation="vertical" className="mx-1 h-4" />
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
          <div className="ml-2 flex h-8 items-center gap-2 rounded-md border bg-background px-2 shadow-xs">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">H</AvatarFallback>
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
