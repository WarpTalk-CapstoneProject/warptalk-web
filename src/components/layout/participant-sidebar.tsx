"use client";

import {
  Clock,
  FileSignature,
  Key,
  LayoutDashboard,
  MessageCircleQuestion,
  Settings,
} from "lucide-react";

import { RoleSidebar, type RoleSidebarGroup } from "@/components/layout/role-sidebar";

const navGroups: RoleSidebarGroup[] = [
  {
    label: "Meetings",
    items: [
      { title: "Dashboard", href: "/participant/dashboard", icon: LayoutDashboard },
      { title: "Join Meeting", href: "/join", icon: Key },
      { title: "Recent Meetings", href: "/participant/meetings", icon: Clock },
    ],
  },
  {
    label: "AI",
    items: [
      { title: "My AI Notes", href: "/participant/summaries", icon: FileSignature, badge: "New" },
      { title: "Ask AI", href: "/participant/ai-chat", icon: MessageCircleQuestion },
    ],
  },
  {
    label: "Configuration",
    items: [
      { title: "Settings", href: "/participant/settings", icon: Settings },
    ],
  },
];

export function ParticipantSidebar() {
  return <RoleSidebar homeHref="/participant/dashboard" srLabel="Participant Dashboard" groups={navGroups} />;
}
