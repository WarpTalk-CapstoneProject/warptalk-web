"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BotMessageSquare,
  BookOpen,
  FileText,
  Headphones,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Mic2,
  Settings,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const navGroups: Array<{
  label: string;
  items: Array<{
    title: string;
    href: string;
    icon: LucideIcon;
    badge?: string;
  }>;
}> = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Rooms", href: "/rooms", icon: LayoutGrid },
      { title: "History", href: "/history", icon: FileText },
    ],
  },
  {
    label: "AI",
    items: [
      { title: "AI Summaries", href: "/ai-summaries", icon: MessageSquare, badge: "New" },
      { title: "Chat with AI", href: "/ai-chat", icon: BotMessageSquare },
    ],
  },
  {
    label: "Configuration",
    items: [
      { title: "Terminology", href: "/terminology", icon: BookOpen },
      { title: "Voice Profiles", href: "/voice-profiles", icon: Mic2 },
      { title: "Feedback", href: "/feedback", icon: Star },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HostSidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);

  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col">
      <div className="border-b p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-2 py-2 text-sidebar-foreground transition hover:bg-sidebar-accent"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-sm font-semibold">WarpTalk</span>
            <span className="truncate text-xs text-muted-foreground">Host Dashboard</span>
          </div>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {navGroups.map((group) => (
          <div key={group.label} className="pb-3">
            <div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium transition",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.badge ? (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                          active ? "bg-white/15 text-white" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t p-3">
        <div className="mb-3 rounded-lg border bg-muted/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Headphones className="h-4 w-4 text-primary" />
            Need help?
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Frontend preview mode is enabled. Review screens without backend auth.
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
