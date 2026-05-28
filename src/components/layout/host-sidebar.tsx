"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const handleSignOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <aside className="hidden h-full w-[248px] shrink-0 overflow-hidden rounded-xl border border-white/[0.125] bg-[rgba(143,143,143,0.1)] text-white backdrop-blur-[10px] backdrop-saturate-200 md:flex md:flex-col">
      <div className="flex h-[52px] items-center border-b border-white/[0.12] px-3">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 text-white transition hover:bg-white/[0.045]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.12] bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-sm font-semibold">WarpTalk</span>
            <span className="truncate text-[11px] text-white/52">Host Dashboard</span>
          </div>
        </Link>
      </div>

      <div className="flex-1 overflow-hidden px-2 py-1.5">
        {navGroups.map((group) => (
          <div key={group.label} className="pb-2">
            <div className="px-2 pb-0.5 text-[10.5px] font-semibold text-white/44">{group.label}</div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex h-[30px] items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition",
                      active
                        ? "border border-white/[0.16] bg-[linear-gradient(105deg,rgba(255,255,255,0.15),rgba(255,255,255,0.045)_46%,rgba(255,255,255,0.12))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),inset_0_0_18px_rgba(255,255,255,0.035)] backdrop-blur-md"
                        : "text-white/58 hover:bg-white/[0.045] hover:text-white/86"
                    )}
                  >
                    <item.icon className={cn("h-3.5 w-3.5 shrink-0", active && "h-[15px] w-[15px]")} />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.badge ? (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                          active ? "bg-white/15 text-white" : "bg-white/10 text-white/58"
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                    {active ? <span className="absolute right-2 h-4 w-0.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.55)]" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.12] p-2.5">
        <div className="mb-2 rounded-lg border border-white/[0.14] bg-white/[0.04] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
            <Headphones className="h-4 w-4 text-cyan-200" />
            Need help?
          </div>
          <p className="text-[10px] leading-relaxed text-white/48">
            Frontend preview mode is enabled. Review screens without backend auth.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-medium text-white/58 transition hover:bg-red-500/10 hover:text-red-200"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
