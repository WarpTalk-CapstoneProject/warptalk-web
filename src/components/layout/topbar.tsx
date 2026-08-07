"use client";

import { NotificationPopover } from "@/components/notifications/notification-popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  BookOpen,
  ChatCircle,
  FileText,
  Flask,
  GearSix,
  MagnifyingGlass,
  Microphone,
  Plus,
  Question,
  Scroll,
  SidebarSimple,
  SignOut,
  SquaresFour,
  Star,
  User,
} from "@phosphor-icons/react/dist/ssr";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

/**
 * WT-321(5): the surface at `/[slug]/rooms` is called **Meetings**, everywhere a person can
 * read it. It was called both: this map titled the list page "Rooms" while the breadcrumb
 * below (and the sidebar, and DEMO-FLOWS.md, and every button on the page — "New Meeting",
 * "Search meetings...", "Active Meetings") said "Meetings".
 *
 * "Meetings" wins because it is the name the product already uses in the places that are
 * hardest to change: the sidebar entry, the demo script the defence follows, and the page's
 * own copy. The URL stays `/rooms` — it is what every shared link, every `router.push`, and
 * the backend's TranslationRoom naming are built on, and renaming a route to match a heading
 * is not a cosmetic change. "Room" survives as the noun for a single room (`Room Code`,
 * `Create Room`), which is also how the backend uses it.
 */
const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  host: "Host",
  participant: "Participant",
  profile: "Profile",
  rooms: "Meetings",
  create: "Create Room",
  history: "History",
  "ai-summaries": "Transcripts",
  "ai-chat": "AI Chat",
  feedback: "Feedback",
  terminology: "Terminology",
  "voice-profiles": "Voice Profiles",
  settings: "GearSix",
  workspace: "Workspace",
  admin: "Admin",
  "dev-test": "Dev Test",
  billing: "Billing & Usage",
  payment: "Payment",
  plans: "Plans",
};

const searchItems: Array<{
  title: string;
  url: string;
  group: string;
  icon: React.ElementType;
  shortcut?: string;
}> = [
  {
    title: "Meetings",
    url: "/rooms",
    group: "Workspace",
    icon: SquaresFour,
    shortcut: "R",
  },
  {
    title: "Create Room",
    url: "/rooms/create",
    group: "Workspace",
    icon: Plus,
    shortcut: "N",
  },
  {
    title: "History & Transcripts",
    url: "/history",
    group: "Workspace",
    icon: FileText,
    shortcut: "H",
  },
  { title: "Transcripts", url: "/ai-summaries", group: "AI", icon: Scroll },
  { title: "Chat with AI", url: "/ai-chat", group: "AI", icon: Question },
  {
    title: "Terminology",
    url: "/terminology",
    group: "Configuration",
    icon: BookOpen,
  },
  {
    title: "Voice Profiles",
    url: "/voice-profiles",
    group: "Configuration",
    icon: Microphone,
  },
  {
    title: "Post-room Feedback",
    url: "/feedback",
    group: "Operations",
    icon: Star,
  },
  { title: "GearSix", url: "/settings", group: "Configuration", icon: GearSix },
  { title: "Dev Test", url: "/dev-test", group: "Developer", icon: Flask },
];

import { useTranslationRoom } from "@/hooks/use-translationRooms";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { Lumidot } from "lumidot";
import { useTheme } from "next-themes";
import Link from "next/link";
import { ThemeToggleButton } from "@/components/layout/theme-toggle-button";

function Breadcrumbs() {
  const activeWorkspaceSlug = useWorkspaceStore(
    (state) => state.activeWorkspaceSlug,
  );
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const current = segments.at(-1);
  const isRoomInformationPage = /^\/rooms\/[^/]+$/.test(pathname);

  const roomId = isRoomInformationPage ? current : undefined;
  const roomQuery = useTranslationRoom(roomId as string);
  const roomTitle = roomQuery.data?.title;
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";

  if (isRoomInformationPage) {
    return (
      <div className="min-w-0 flex items-center gap-2 text-[14px] font-medium tracking-tight">
        <Link
          href={`/${activeWorkspaceSlug || "workspace"}/rooms`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Meetings
        </Link>
        <CaretRight
          weight="bold"
          className="text-muted-foreground/40 w-3 h-3"
        />
        <span className="truncate text-foreground max-w-[300px] flex items-center gap-2">
          {roomTitle ? (
            roomTitle
          ) : (
            <>
              <Lumidot variant={lumidotVariant} pattern="frame" glow={4} />
              <span>Loading...</span>
            </>
          )}
        </span>
      </div>
    );
  }

  const label = current ? (routeLabels[current] ?? current) : "Dashboard";

  return (
    <div className="min-w-0">
      <h1 className="truncate text-[16px] font-semibold tracking-tight text-foreground capitalize">
        {label}
      </h1>
    </div>
  );
}

function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden h-8 w-full max-w-[330px] items-center gap-2 rounded-md bg-muted/50 border border-border px-3 text-[13px] text-muted-foreground transition hover:bg-muted md:flex"
    >
      <MagnifyingGlass weight="light" className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">MagnifyingGlass pages...</span>
      <kbd className="rounded-sm bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
        Ctrl K
      </kbd>
    </button>
  );
}

function IconButton({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
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
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);
  const activeWorkspaceSlug = useWorkspaceStore(
    (state) => state.activeWorkspaceSlug,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const groupedItems = useMemo(
    () =>
      searchItems.reduce<Record<string, typeof searchItems>>((groups, item) => {
        groups[item.group] = [...(groups[item.group] ?? []), item];
        return groups;
      }, {}),
    [],
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

  const WORKSPACE_SCOPED_PREFIXES = ["/rooms", "/history", "/ai-summaries"];
  const handleSelect = (url: string) => {
    const slug = activeWorkspaceSlug || "workspace";
    const isScoped = WORKSPACE_SCOPED_PREFIXES.some(
      (p) => url === p || url.startsWith(p + "/"),
    );
    const finalUrl = isScoped ? `/${slug}${url}` : url;
    router.push(finalUrl);
    setSearchOpen(false);
  };

  const roleLabel = pathname.startsWith("/participant")
    ? "Participant"
    : pathname.startsWith("/workspace")
      ? "Workspace"
      : pathname.startsWith("/billing")
        ? "Internal"
        : "Host";
  const roleInitial = roleLabel.slice(0, 1);
  const profileHref = pathname.startsWith("/participant")
    ? "/participant/profile"
    : pathname.startsWith("/workspace")
      ? "/workspace/profile"
      : pathname.startsWith("/billing")
        ? "/profile"
        : `/${activeWorkspaceSlug || "workspace"}/profile`;

  const handleSignOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[63px] shrink-0 items-center gap-4 border-b border-border bg-background px-4">
        <button
          type="button"
          aria-label="Toggle sidebar"
          title="Sidebar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <SidebarSimple weight="light" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>
        <SearchTrigger onClick={() => setSearchOpen(true)} />
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Help">
            <Question weight="light" className="h-4 w-4" />
          </IconButton>
          <NotificationPopover />
          <ThemeToggleButton />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="ml-2 flex h-8 items-center gap-2 rounded-md bg-muted/50 px-2 text-foreground outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open account menu"
            >
              <Avatar className="h-5 w-5">
                <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
                  {roleInitial}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-[13px] font-medium sm:inline">
                {roleLabel}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-sm"
            >
              <DropdownMenuItem
                onClick={() => router.push(profileHref)}
                className="h-8 cursor-pointer gap-2 rounded-md px-2 text-[13px] focus:bg-muted"
              >
                <User weight="light" className="h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toast.info("Community is coming soon.")}
                className="h-8 cursor-pointer gap-2 rounded-md px-2 text-[13px] focus:bg-muted"
              >
                <ChatCircle weight="light" className="h-4 w-4" />
                <span>Community</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toast.info("Help Center is coming soon.")}
                className="h-8 cursor-pointer gap-2 rounded-md px-2 text-[13px] focus:bg-muted"
              >
                <Question weight="light" className="h-4 w-4" />
                <span>Help Center</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-border" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="h-8 cursor-pointer gap-2 rounded-md px-2 text-[13px] focus:bg-muted"
              >
                <SignOut weight="light" className="h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        className="max-w-[640px]"
      >
        <Command className="rounded-xl">
          <CommandInput
            placeholder="MagnifyingGlass WarpTalk pages..."
            autoFocus
          />
          <CommandList>
            <CommandEmpty>No page found.</CommandEmpty>
            {Object.entries(groupedItems).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((item) => (
                  <CommandItem
                    key={item.url}
                    value={item.title}
                    onSelect={() => handleSelect(item.url)}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                    {item.shortcut ? (
                      <CommandShortcut>{item.shortcut}</CommandShortcut>
                    ) : null}
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
