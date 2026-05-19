"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LayoutGrid,
  FileText,
  MessageSquare,
  BotMessageSquare,
  BookOpen,
  Mic2,
  Star,
  Settings,
  Headset,
  ExternalLink,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Rooms", href: "/rooms", icon: LayoutGrid },
  { name: "History & Transcripts", href: "/history", icon: FileText },
];

const aiNavigation = [
  { name: "AI Summaries & Notes", href: "/ai-summaries", icon: MessageSquare },
  { name: "Chat with AI", href: "/ai-chat", icon: BotMessageSquare },
];

const configNavigation = [
  { name: "Terminology", href: "/terminology", icon: BookOpen },
  { name: "Voice Profiles", href: "/voice-profiles", icon: Mic2 },
  { name: "Post-room Feedback", href: "/feedback", icon: Star },
  { name: "Settings", href: "/settings", icon: Settings },
];

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

export function HostSidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);

  const renderNavItems = (items: NavItem[]) => {
    return items.map((item) => {
      const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
            isActive
              ? "bg-[#003476] text-white shadow-sm font-semibold"
              : "text-[#000000] hover:bg-[#fdfcf6] hover:text-[#003476]"
          )}
        >
          <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-[#000000]")} />
          <span>{item.name}</span>
        </Link>
      );
    });
  };

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white text-[#000000]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-6 pt-4">
        <Image 
          src="/assets/logos/warptalk-logo-primary.jpg" 
          alt="WarpTalk" 
          width={140} 
          height={36} 
          className="object-contain"
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pt-6">
        {renderNavItems(navigation)}
        
        <div className="my-4" />
        <div className="px-3 mb-2 text-[10px] font-bold text-[#000000] uppercase tracking-wider">AI Features</div>
        {renderNavItems(aiNavigation)}
        
        <div className="my-4" />
        <div className="px-3 mb-2 text-[10px] font-bold text-[#000000] uppercase tracking-wider">Configuration</div>
        {renderNavItems(configNavigation)}

        <div className="my-4 border-t border-slate-100" />
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
        >
          <LogOut className="h-5 w-5" />
          <span>Sign Out</span>
        </button>
      </nav>

      {/* Help Center Widget */}
      <div className="p-3 mt-auto shrink-0">
        <div className="rounded-xl border border-slate-100 bg-[#fdfcf6] p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Headset className="h-4 w-4 text-[#003476]" />
            <span className="text-xs font-semibold text-[#003476]">Need help?</span>
          </div>
          <p className="text-[10px] text-[#e4eef9] mb-3 leading-relaxed">
            View docs or contact support.
          </p>
          <Button variant="outline" className="w-full h-7 text-[10px] bg-white rounded-md gap-1.5 shadow-sm border-slate-200 text-[#003476]">
            Open Help Center
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
