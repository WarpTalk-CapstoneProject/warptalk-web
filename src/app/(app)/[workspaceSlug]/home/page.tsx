"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ChartBar,
  ClockCounterClockwise,
  CreditCard,
  FileText,
  GearSix,
  Keyboard,
  MagnifyingGlass,
  Plus,
  Users,
  VideoCamera,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";

type QuickAction = {
  title: string;
  description: string;
  icon: React.ElementType;
  href?: string;
  onClick?: () => void;
  featured?: boolean;
};

function QuickActionCard({ action, index }: { action: QuickAction; index: number }) {
  const Icon = action.icon;
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: index * 0.025 }}
      whileTap={{ y: 2 }}
      className={cn(
        "group flex h-full min-h-[92px] items-start gap-3 rounded-[12px] border p-3 text-left transition-all",
        action.featured
          ? "border-primary bg-primary text-on-primary shadow-[0_12px_26px_rgba(94,106,210,0.24)] hover:bg-primary-hover"
          : "border-border bg-surface-1 shadow-linear hover:-translate-y-0.5 hover:border-hairline-strong hover:bg-surface-2",
        action.href || action.onClick ? "cursor-pointer" : ""
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-[9px] border transition-colors",
          action.featured
            ? "border-white/20 bg-white/12 text-white"
            : "border-border bg-canvas text-primary group-hover:border-primary/30 group-hover:bg-primary/10"
        )}
      >
        <Icon size={18} weight="duotone" />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[13px] font-semibold leading-5", action.featured ? "text-white" : "text-ink")}>
          {action.title}
        </span>
        <span className={cn("mt-1 block text-[12px] leading-5", action.featured ? "text-white/72" : "text-ink-muted")}>
          {action.description}
        </span>
      </span>
    </motion.div>
  );

  if (action.href) {
    return (
      <Link href={action.href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      className="h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {content}
    </button>
  );
}

export default function WorkspaceHomePage() {
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const role = useWorkspaceRole();
  const setCreateRoomModalOpen = useUIStore((s) => s.setCreateRoomModalOpen);
  const setSearchMeetingModalOpen = useUIStore((s) => s.setSearchMeetingModalOpen);

  const slug = activeWorkspaceSlug || "workspace";
  const isOwnerOrAdmin = role === "owner" || role === "admin";

  const quickActions: QuickAction[] = [
    {
      title: "Create room",
      description: "Open a live translation space for your team.",
      icon: Plus,
      onClick: () => setCreateRoomModalOpen(true),
      featured: true,
    },
    {
      title: "Find meeting",
      description: "Search rooms, notes, and saved transcripts.",
      icon: MagnifyingGlass,
      onClick: () => setSearchMeetingModalOpen(true),
    },
    {
      title: "Join by code",
      description: "Enter an invite code from another host.",
      icon: Keyboard,
      href: "/join",
    },
    {
      title: "Meetings",
      description: "Review scheduled, live, and past rooms.",
      icon: VideoCamera,
      href: `/${slug}/rooms`,
    },
    {
      title: "History",
      description: "Return to conversations already captured.",
      icon: ClockCounterClockwise,
      href: `/${slug}/history`,
    },
    {
      title: "Documents",
      description: "Manage vocabulary and reference material.",
      icon: FileText,
      href: `/${slug}/documents`,
    },
    {
      title: "Members",
      description: "Invite teammates and review workspace roles.",
      icon: Users,
      href: `/${slug}/members`,
    },
  ];

  if (isOwnerOrAdmin) {
    quickActions.push(
      {
        title: "Billing",
        description: "Manage plan, seats, and workspace invoices.",
        icon: CreditCard,
        href: `/${slug}/billing`,
      },
      {
        title: "Dashboard",
        description: "Track usage, activity, and workspace health.",
        icon: ChartBar,
        href: `/${slug}/dashboard`,
      },
      {
        title: "Settings",
        description: "Control workspace profile and access rules.",
        icon: GearSix,
        href: `/${slug}/settings`,
      }
    );
  }

  return (
    <div className="min-h-full bg-surface-1 px-4 py-5 text-ink sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-3 pb-8">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Quick jumps</h2>
          <p className="mt-1 text-[12px] text-ink-muted">Shortcuts styled from the WarpTalk token system.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {quickActions.map((action, index) => (
            <QuickActionCard key={`${action.title}-${action.href || "action"}`} action={action} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
