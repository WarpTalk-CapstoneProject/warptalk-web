"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarBlank,
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

import { useTranslationRooms } from "@/hooks/use-translationRooms";
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

type ServiceCard = {
  title: string;
  description: string;
  icon: React.ElementType;
  href?: string;
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

function ServiceCard({ service, index }: { service: ServiceCard; index: number }) {
  const Icon = service.icon;
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: 0.08 + index * 0.03 }}
      className="group flex h-full min-h-[118px] flex-col justify-between rounded-[14px] border border-border bg-surface-1 p-4 shadow-linear transition hover:-translate-y-0.5 hover:border-hairline-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-[10px] border border-border bg-canvas text-primary">
          <Icon size={20} weight="duotone" />
        </span>
        <ArrowRight size={15} className="text-ink-subtle transition group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-ink">{service.title}</h3>
        <p className="mt-1 text-[12px] leading-5 text-ink-muted">{service.description}</p>
      </div>
    </motion.div>
  );

  if (!service.href) return content;

  return (
    <Link href={service.href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
      {content}
    </Link>
  );
}

function formatRoomDate(value?: string) {
  const date = new Date(value || Date.now());
  return {
    day: date.getDate().toString().padStart(2, "0"),
    month: date.toLocaleDateString("en-US", { month: "short" }),
    time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

export default function WorkspaceHomePage() {
  const user = useAuthStore((s) => s.user);
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const activeWorkspaceName = useWorkspaceStore((s) => s.activeWorkspaceName);
  const role = useWorkspaceRole();
  const setCreateRoomModalOpen = useUIStore((s) => s.setCreateRoomModalOpen);
  const setSearchMeetingModalOpen = useUIStore((s) => s.setSearchMeetingModalOpen);

  const { data: roomsData, isLoading: isLoadingRooms } = useTranslationRooms({ pageSize: 6 });
  const recentRooms = roomsData?.rooms || [];
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
        description: "Start trial, review contract status, and pay invoices.",
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

  const services: ServiceCard[] = [
    {
      title: "Live rooms",
      description: "Speak, translate, and capture every session.",
      icon: VideoCamera,
      href: `/${slug}/rooms`,
    },
    {
      title: "Transcripts",
      description: "Full dialogue, AI summary, and retained artifacts.",
      icon: Sparkle,
      href: `/${slug}/ai-summaries`,
    },
    {
      title: "Knowledge",
      description: "Keep team terms and documents close to the call.",
      icon: FileText,
      href: `/${slug}/documents`,
    },
  ];

  return (
    <div className="min-h-full bg-canvas px-4 py-5 text-ink sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-5 pb-8">
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="overflow-hidden rounded-[18px] border border-border bg-surface-1 shadow-linear"
        >
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
            <div className="relative min-h-[318px] border-b border-border p-5 sm:p-7 lg:border-b-0 lg:border-r">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_20%_0%,rgba(94,106,210,0.16),transparent_34%),linear-gradient(180deg,rgba(94,106,210,0.08),transparent)]" />
              <div className="relative">
                <p className="mb-3 text-[12px] font-medium text-ink-muted">{activeWorkspaceName || "My Workspace"}</p>
                <h1 className="max-w-[640px] text-[34px] font-semibold leading-[1.04] tracking-normal text-ink sm:text-[44px]">
                  Welcome,{" "}
                  <span className="font-normal italic" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    {displayName}
                  </span>
                </h1>
                <p className="mt-3 max-w-[560px] text-[13px] leading-6 text-ink-muted sm:text-[14px]">
                  Start the next conversation, pick up a transcript, or open the workspace tools your team uses most.
                </p>
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

            <div className="p-5 sm:p-7">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink">Workspace launchpad</h2>
                  <p className="mt-1 text-[12px] text-ink-muted">Core flows for the first minute after login.</p>
                </div>
                <Link
                  href={`/${slug}/rooms`}
                  className="hidden items-center gap-1 text-[12px] font-semibold text-primary transition hover:text-ink sm:inline-flex"
                >
                  Open meetings <ArrowRight size={13} />
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {services.map((service, index) => (
                  <ServiceCard key={service.title} service={service} index={index} />
                ))}
              </div>
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

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: 0.12 }}
          className="rounded-[16px] border border-border bg-surface-1 p-4 shadow-linear"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Active and upcoming</h2>
              <p className="mt-1 text-[12px] text-ink-muted">The next rooms needing attention.</p>
            </div>
            <Link
              href={`/${slug}/rooms`}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary transition hover:text-ink"
            >
              View all <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {isLoadingRooms ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex h-[74px] animate-pulse items-center gap-3 rounded-[12px] border border-border bg-canvas p-3">
                  <div className="size-11 rounded-[10px] bg-surface-3" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded bg-surface-3" />
                    <div className="h-3 w-2/3 rounded bg-surface-3" />
                  </div>
                </div>
              ))
            ) : recentRooms.length > 0 ? (
              recentRooms.slice(0, 4).map((room) => {
                const roomDate = formatRoomDate(room.scheduledAt || room.createdAt);
                const isLive = room.status === "in_progress";

                return (
                  <Link href={`/${slug}/rooms/${room.id}`} key={room.id} className="group block">
                    <div className="flex min-h-[74px] items-center gap-3 rounded-[12px] border border-border bg-canvas p-3 transition hover:border-hairline-strong hover:bg-surface-1">
                      <div className="grid size-12 shrink-0 place-items-center rounded-[10px] border border-border bg-surface-1 text-center">
                        <span className="text-[10px] font-semibold uppercase text-ink-muted">{roomDate.month}</span>
                        <span className="-mt-1 text-[18px] font-semibold text-ink">{roomDate.day}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                              isLive ? "bg-status-scheduled/10 text-status-scheduled" : "bg-surface-2 text-ink-muted"
                            )}
                          >
                            {isLive ? <span className="size-1.5 rounded-full bg-status-scheduled" /> : null}
                            {isLive ? "Live now" : roomDate.time}
                          </span>
                        </div>
                        <h3 className="truncate text-[14px] font-semibold text-ink group-hover:text-primary">
                          {room.title || "Untitled meeting"}
                        </h3>
                      </div>
                      <ArrowRight size={15} className="text-ink-subtle transition group-hover:translate-x-0.5 group-hover:text-ink" />
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="rounded-[12px] border border-dashed border-border bg-canvas px-4 py-8 text-center lg:col-span-2">
                <CalendarBlank size={26} className="mx-auto text-ink-subtle" weight="duotone" />
                <p className="mt-3 text-[13px] font-medium text-ink">No rooms scheduled</p>
                <p className="mt-1 text-[12px] text-ink-muted">Create a room when your team is ready to talk.</p>
              </div>
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
