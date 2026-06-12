"use client";

import { BookOpen, Robot, CreditCard, FileText, SquaresFour, ChartLineUp, GearSix, SlidersHorizontal, Users } from "@phosphor-icons/react/dist/ssr";

import { RoleSidebar, type RoleSidebarGroup } from "@/components/layout/role-sidebar";

const navGroups: RoleSidebarGroup[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/workspace/dashboard", icon: SquaresFour },
      { title: "Members", href: "/workspace/members", icon: Users },
      { title: "Rooms", href: "/workspace/rooms", icon: ChartLineUp },
      { title: "Artifacts", href: "/workspace/artifacts", icon: FileText },
      { title: "AI Chat", href: "/workspace/ai-chat", icon: Robot },
    ],
  },
  {
    label: "Governance",
    items: [
      { title: "Meeting Setup", href: "/workspace/meeting-settings", icon: SlidersHorizontal },
      { title: "Terminology", href: "/workspace/terminology", icon: BookOpen },
      { title: "Wallet", href: "/workspace/wallet", icon: CreditCard },
      { title: "Settings", href: "/workspace/settings", icon: GearSix },
    ],
  },
];

export function WorkspaceSidebar() {
  return <RoleSidebar homeHref="/workspace/dashboard" srLabel="Workspace Dashboard" groups={navGroups} />;
}
