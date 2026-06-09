"use client";

import { Clock, Signature, Key, SquaresFour, Question, GearSix } from "@phosphor-icons/react/dist/ssr";

import { RoleSidebar, type RoleSidebarGroup } from "@/components/layout/role-sidebar";

const navGroups: RoleSidebarGroup[] = [
  {
    label: "Meetings",
    items: [
      { title: "Dashboard", href: "/participant/dashboard", icon: SquaresFour },
      { title: "Join Meeting", href: "/join", icon: Key },
      { title: "Recent Meetings", href: "/participant/meetings", icon: Clock },
    ],
  },
  {
    label: "AI",
    items: [
      { title: "My AI Notes", href: "/participant/summaries", icon: Signature, badge: "New" },
      { title: "Ask AI", href: "/participant/ai-chat", icon: Question },
    ],
  },
  {
    label: "Configuration",
    items: [
      { title: "GearSix", href: "/participant/settings", icon: GearSix },
    ],
  },
];

export function ParticipantSidebar() {
  return <RoleSidebar homeHref="/participant/dashboard" srLabel="Participant Dashboard" groups={navGroups} />;
}
