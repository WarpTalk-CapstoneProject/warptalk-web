"use client";

import {
  BotMessageSquare,
  BookOpen,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  Mic2,
  Settings,
  Star,
} from "lucide-react";

import { RoleSidebar, type RoleSidebarGroup } from "@/components/layout/role-sidebar";

const navGroups: RoleSidebarGroup[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/host/dashboard", icon: LayoutDashboard },
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

export function HostSidebar() {
  return <RoleSidebar homeHref="/host/dashboard" srLabel="Host Dashboard" groups={navGroups} />;
}
