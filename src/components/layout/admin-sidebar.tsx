"use client";

import { Robot, Buildings, CreditCard, SquaresFour, GearSix, Users } from "@phosphor-icons/react/dist/ssr";

import { RoleSidebar, type RoleSidebarGroup } from "@/components/layout/role-sidebar";

const navGroups: RoleSidebarGroup[] = [
  {
    label: "Internal",
    items: [
      { title: "Dashboard", href: "/internal/dashboard", icon: SquaresFour },
      { title: "Workspaces", href: "/internal/workspaces", icon: Buildings },
      { title: "Users", href: "/internal/users", icon: Users },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Plans", href: "/internal/plans", icon: CreditCard },
      { title: "Billing", href: "/internal/billing", icon: CreditCard },
      { title: "AI Ops", href: "/internal/ai-ops", icon: Robot },
      { title: "Support", href: "/internal/support", icon: Users },
      { title: "GearSix", href: "/internal/settings", icon: GearSix },
    ],
  },
];

export function AdminSidebar() {
  return <RoleSidebar homeHref="/internal/dashboard" srLabel="Internal Dashboard" groups={navGroups} />;
}
