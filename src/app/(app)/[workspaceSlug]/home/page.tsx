"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  ChartBar,
  ClockCounterClockwise,
  CreditCard,
  FileText,
  GearSix,
  Keyboard,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Users,
  VideoCamera,
} from "@phosphor-icons/react";

import { AppleHelloTextEffect } from "@/components/visuals/apple-hello-text-effect";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
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

function LaunchpadSquareGrid() {
  return (
    <div className="flex flex-1 items-center justify-center overflow-hidden p-3">
      <div className="grid grid-cols-5 place-items-center gap-[clamp(0.55rem,1.1vw,0.95rem)]">
        {Array.from({ length: 25 }).map((_, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, delay: index * 0.014 }}
            className="aspect-square size-[clamp(3.1rem,4.35vw,4.7rem)] rounded-[3px] border border-white/10 bg-black shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition hover:scale-[1.03] hover:border-primary/60"
          />
        ))}
      </div>
    </div>
  );
}

export default function WorkspaceHomePage() {
  const user = useAuthStore((s) => s.user);
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);
  const role = useWorkspaceRole();
  const setCreateRoomModalOpen = useUIStore((s) => s.setCreateRoomModalOpen);
  const setSearchMeetingModalOpen = useUIStore((s) => s.setSearchMeetingModalOpen);

  const slug = activeWorkspaceSlug || "workspace";
  const displayName = user?.fullName || "User";
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
      title: "Transcripts",
      description: "Read the transcript, AI summary, and artifacts.",
      icon: Sparkle,
      href: `/${slug}/ai-summaries`,
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
    <div className="min-h-full bg-canvas px-4 py-5 text-ink sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-5 pb-8">
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="min-h-[calc(100vh-112px)] overflow-hidden rounded-[18px] border border-border bg-surface-1 shadow-linear"
        >
          <div className="grid min-h-[calc(100vh-112px)] grid-cols-[minmax(360px,1.08fr)_minmax(300px,0.92fr)] gap-0 max-[760px]:grid-cols-1">
            <div className="relative min-h-[520px] border-r border-border p-5 sm:p-7 max-[760px]:border-b max-[760px]:border-r-0">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_20%_0%,rgba(94,106,210,0.16),transparent_34%),linear-gradient(180deg,rgba(94,106,210,0.08),transparent)]" />
              <div className="relative">
                <p className="mb-3 text-[12px] font-medium text-ink-muted">{activeWorkspaceName || "My Workspace"}</p>
                <h1 className="sr-only">Hello, {displayName}</h1>
                <AppleHelloTextEffect
                  text={displayName}
                  durationScale={1}
                  className="max-w-[920px] text-primary"
                />
              </div>

              <div className="relative mt-7 rounded-[16px] border border-border bg-canvas p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
                  {[
                    { label: "Speech", icon: VideoCamera, active: true },
                    { label: "Notes", icon: FileText },
                    { label: "AI", icon: Sparkle },
                    { label: "Team", icon: Users },
                  ].map((item) => (
                    <span
                      key={item.label}
                      className={cn(
                        "inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-[12px] font-semibold",
                        item.active ? "bg-surface-1 text-ink shadow-linear" : "text-ink-muted"
                      )}
                    >
                      <item.icon size={15} weight="duotone" />
                      {item.label}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setCreateRoomModalOpen(true)}
                  className="group mt-3 flex min-h-[94px] w-full items-center justify-between gap-4 rounded-[12px] border border-dashed border-hairline-strong bg-surface-1 px-4 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">Start typing a meeting topic...</span>
                    <span className="mt-1 block text-[12px] leading-5 text-ink-muted">
                      Create a room with translation, notes, and AI capture ready.
                    </span>
                  </span>
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary text-on-primary transition group-hover:bg-primary-hover">
                    <ArrowRight size={18} weight="bold" />
                  </span>
                </button>
              </div>
            </div>

            <div className="flex min-h-[520px] flex-col p-5 sm:p-7">
              <LaunchpadSquareGrid />
            </div>
          </div>
        </motion.section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Quick jumps</h2>
              <p className="mt-1 text-[12px] text-ink-muted">Shortcuts styled from the WarpTalk token system.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action, index) => (
              <QuickActionCard key={`${action.title}-${action.href || "action"}`} action={action} index={index} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
