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
  LogOut,
  MessageCircle,
  Mic2,
  Moon,
  PanelLeft,
  Plus,
  Search,
  ServerCog,
  Settings,
  Sparkles,
  Star,
  TestTube2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth-store";

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  host: "Host",
  participant: "Participant",
  profile: "Profile",
  rooms: "Rooms",
  create: "Create Room",
  history: "History",
  "ai-summaries": "AI Summaries",
  "ai-chat": "AI Chat",
  feedback: "Feedback",
  terminology: "Terminology",
  "voice-profiles": "Voice Profiles",
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
  { title: "Host Dashboard", url: "/host/dashboard", group: "Host", icon: LayoutDashboard, shortcut: "D" },
  { title: "Participant Dashboard", url: "/participant/dashboard", group: "Participant", icon: Users },
  { title: "Workspace Dashboard", url: "/workspace/dashboard", group: "Workspace", icon: Building2 },
  { title: "Internal Dashboard", url: "/internal/dashboard", group: "Internal", icon: ServerCog },
  { title: "Rooms", url: "/rooms", group: "Workspace", icon: LayoutGrid, shortcut: "R" },
  { title: "Create Room", url: "/rooms/create", group: "Workspace", icon: Plus, shortcut: "N" },
  { title: "History & Transcripts", url: "/history", group: "Workspace", icon: FileText, shortcut: "H" },
  { title: "AI Summaries", url: "/ai-summaries", group: "AI", icon: Sparkles },
  { title: "Chat with AI", url: "/ai-chat", group: "AI", icon: BotMessageSquare },
  { title: "Terminology", url: "/terminology", group: "Configuration", icon: BookOpen },
  { title: "Voice Profiles", url: "/voice-profiles", group: "Configuration", icon: Mic2 },
  { title: "Post-room Feedback", url: "/feedback", group: "Operations", icon: Star },
  { title: "Settings", url: "/settings", group: "Configuration", icon: Settings },
  { title: "Workspace", url: "/workspace/dashboard", group: "Administration", icon: Building2 },
  { title: "Internal Admin", url: "/internal/dashboard", group: "Administration", icon: ServerCog },
  { title: "Dev Test", url: "/dev-test", group: "Developer", icon: TestTube2 },
];

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const current = segments.at(-1);
  const isRoomInformationPage = /^\/rooms\/[^/]+$/.test(pathname);
  const label = isRoomInformationPage ? "Information Room" : current ? routeLabels[current] ?? current : "Dashboard";

  return (
    <div className="min-w-0">
      <h1 className="truncate text-2xl font-semibold tracking-tight text-neutral-950">{label}</h1>
      {!isRoomInformationPage ? <p className="text-xs text-neutral-500">WarpTalk workspace</p> : null}
    </div>
  );
}

function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dashboard-glass-surface hidden h-9 w-full max-w-[330px] items-center gap-2 rounded-full px-3 text-sm text-neutral-600 transition hover:text-neutral-950 md:flex"
    >
      <Search className="relative z-[2] h-4 w-4" />
      <span className="relative z-[2] flex-1 text-left">Search pages...</span>
      <kbd className="relative z-[2] rounded-full border border-neutral-950/10 bg-neutral-950/5 px-1.5 font-mono text-[10px] text-neutral-500">Ctrl K</kbd>
    </button>
  );
}

function IconButton({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="dashboard-glass-surface inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-950 transition hover:text-neutral-950"
    >
      {children}
    </button>
  );
}

export function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);
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

  const roleLabel = pathname.startsWith("/participant")
    ? "Participant"
    : pathname.startsWith("/workspace")
      ? "Workspace"
      : pathname.startsWith("/internal")
        ? "Internal"
        : "Host";
  const roleInitial = roleLabel.slice(0, 1);
  const profileHref = pathname.startsWith("/participant")
    ? "/participant/profile"
    : pathname.startsWith("/workspace")
      ? "/workspace/profile"
      : pathname.startsWith("/internal")
        ? "/internal/profile"
        : "/host/profile";

  const handleSignOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[70px] shrink-0 items-center gap-2 bg-transparent px-1 text-neutral-950">
        <button
          type="button"
          aria-label="Toggle sidebar"
          title="Sidebar"
          className="dashboard-glass-surface inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-950 transition hover:text-neutral-950"
        >
          <PanelLeft className="relative z-[2] h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>
        <SearchTrigger onClick={() => setSearchOpen(true)} />
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Help">
            <CircleHelp className="relative z-[2] h-4 w-4" />
          </IconButton>
          <IconButton label="Notifications">
            <Bell className="relative z-[2] h-4 w-4" />
          </IconButton>
          <IconButton label="Theme">
            <Moon className="relative z-[2] h-4 w-4" />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="dashboard-glass-surface ml-1.5 flex h-9 items-center gap-2 rounded-full px-2 text-neutral-950 outline-none transition hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-neutral-950/20"
              aria-label="Open account menu"
            >
              <Avatar className="relative z-[2] h-6 w-6">
                <AvatarFallback className="bg-neutral-950 text-xs text-white">{roleInitial}</AvatarFallback>
              </Avatar>
              <span className="relative z-[2] hidden text-sm font-medium sm:inline">{roleLabel}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="w-56 rounded-2xl border border-neutral-200/80 bg-white p-2 text-neutral-950 shadow-[0_18px_48px_rgba(15,15,15,0.14)]"
            >
              <DropdownMenuItem
                onClick={() => router.push(profileHref)}
                className="h-11 cursor-pointer gap-3 rounded-xl bg-neutral-100 px-3 text-sm font-medium focus:bg-neutral-200"
              >
                <UserRound className="h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toast.info("Community is coming soon.")}
                className="h-11 cursor-pointer gap-3 rounded-xl px-3 text-sm font-medium focus:bg-neutral-100"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Community</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toast.info("Help Center is coming soon.")}
                className="h-11 cursor-pointer gap-3 rounded-xl px-3 text-sm font-medium focus:bg-neutral-100"
              >
                <CircleHelp className="h-4 w-4" />
                <span>Help Center</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2 bg-neutral-200" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="h-11 cursor-pointer gap-3 rounded-xl px-3 text-sm font-medium focus:bg-neutral-100"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
