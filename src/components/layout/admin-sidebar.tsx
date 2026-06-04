"use client";

import { Bot, Building2, CreditCard, LayoutDashboard, Settings, Users } from "lucide-react";

import { RoleSidebar, type RoleSidebarGroup } from "@/components/layout/role-sidebar";

const navGroups: RoleSidebarGroup[] = [
  {
    label: "Internal",
    items: [
      { title: "Dashboard", href: "/internal/dashboard", icon: LayoutDashboard },
      { title: "Workspaces", href: "/internal/workspaces", icon: Building2 },
      { title: "Users", href: "/internal/users", icon: Users },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Plans", href: "/internal/plans", icon: CreditCard },
      { title: "AI Ops", href: "/internal/ai-ops", icon: Bot },
      { title: "Support", href: "/internal/support", icon: Users },
      { title: "Settings", href: "/internal/settings", icon: Settings },
    ],
  },
];

export function AdminSidebar() {
  return <RoleSidebar homeHref="/internal/dashboard" srLabel="Internal Dashboard" groups={navGroups} />;
}
