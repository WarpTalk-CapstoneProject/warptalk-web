"use client";

import { ChatCircleText, BookOpen, FileText, SquaresFour, ChatCircle, Microphone, GearSix, Star } from "@phosphor-icons/react/dist/ssr";

import { RoleSidebar, type RoleSidebarGroup } from "@/components/layout/role-sidebar";

const navGroups: RoleSidebarGroup[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/host/dashboard", icon: SquaresFour },
      { title: "Meetings", href: "/rooms", icon: SquaresFour },
      { title: "History", href: "/history", icon: FileText },
    ],
  },
  {
    label: "AI",
    items: [
      { title: "AI Summaries", href: "/ai-summaries", icon: ChatCircle, badge: "New" },
      { title: "Chat with AI", href: "/ai-chat", icon: ChatCircleText },
    ],
  },
  {
    label: "Configuration",
    items: [
      { title: "Terminology", href: "/terminology", icon: BookOpen },
      { title: "Voice Profiles", href: "/voice-profiles", icon: Microphone },
      { title: "Feedback", href: "/feedback", icon: Star },
      { title: "GearSix", href: "/settings", icon: GearSix },
    ],
  },
];

export function HostSidebar() {
  return <RoleSidebar homeHref="/host/dashboard" srLabel="Host Dashboard" groups={navGroups} />;
}
