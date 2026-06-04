"use client";

import { BookOpen, CreditCard, FileText, LayoutDashboard, LineChart, Settings, Users } from "lucide-react";

import { RoleSidebar, type RoleSidebarGroup } from "@/components/layout/role-sidebar";

const navGroups: RoleSidebarGroup[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/workspace/dashboard", icon: LayoutDashboard },
      { title: "Members", href: "/workspace/members", icon: Users },
      { title: "Rooms", href: "/workspace/rooms", icon: LineChart },
      { title: "Artifacts", href: "/workspace/artifacts", icon: FileText },
    ],
  },
  {
    label: "Governance",
    items: [
      { title: "Terminology", href: "/workspace/terminology", icon: BookOpen },
      { title: "Billing", href: "/workspace/billing", icon: CreditCard },
      { title: "Settings", href: "/workspace/settings", icon: Settings },
    ],
  },
];

export function WorkspaceSidebar() {
  return <RoleSidebar homeHref="/workspace/dashboard" srLabel="Workspace Dashboard" groups={navGroups} />;
}
