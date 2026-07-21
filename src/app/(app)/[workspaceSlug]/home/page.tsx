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

type QuickAction = {
  title: string;
  icon: React.ElementType;
  href?: string;
  onClick?: () => void;
  tone: string;
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
        "inline-flex h-12 items-center gap-2.5 rounded-[10px] border border-[#e1e6ef] bg-white px-4 text-[15px] font-semibold",
        "shadow-[0_3px_0_#d8dee9,0_10px_22px_rgba(16,24,40,0.07)] transition-all",
        "hover:-translate-y-0.5 hover:border-[#d4dae6] hover:shadow-[0_4px_0_#d1d8e3,0_14px_26px_rgba(16,24,40,0.1)]",
        "active:translate-y-[3px] active:shadow-[0_1px_0_#d1d8e3,0_6px_14px_rgba(16,24,40,0.08)]",
        action.href || action.onClick ? "cursor-pointer" : ""
      )}
    >
      <span className={cn("grid size-5 shrink-0 place-items-center", action.tone)}>
        <Icon size={20} weight="duotone" />
      </span>
      <span className={cn("whitespace-nowrap", action.tone)}>{action.title}</span>
    </motion.div>
  );

  if (action.href) {
    return (
      <Link href={action.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {content}
    </button>
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
  const role = useWorkspaceStore((s) => s.role);
  const setCreateRoomModalOpen = useUIStore((s) => s.setCreateRoomModalOpen);
  const setSearchMeetingModalOpen = useUIStore((s) => s.setSearchMeetingModalOpen);

  const { data: roomsData, isLoading: isLoadingRooms } = useTranslationRooms({ pageSize: 6 });
  const recentRooms = roomsData?.rooms || [];
  const slug = activeWorkspaceSlug || "workspace";
  const displayName = user?.fullName || "User";
  const isOwnerOrAdmin = role === "Owner" || role === "Admin";

  const quickActions: QuickAction[] = [
	    {
	      title: "Create room",
	      icon: Plus,
	      onClick: () => setCreateRoomModalOpen(true),
	      tone: "text-[#d63384]",
	    },
	    {
	      title: "Find meeting",
	      icon: MagnifyingGlass,
	      onClick: () => setSearchMeetingModalOpen(true),
	      tone: "text-[#ef4444]",
	    },
	    {
	      title: "Join by code",
	      icon: Keyboard,
	      href: "/join",
	      tone: "text-[#8b5cf6]",
	    },
	    {
	      title: "Meetings",
	      icon: VideoCamera,
	      href: `/${slug}/rooms`,
	      tone: "text-[#10b981]",
	    },
	    {
	      title: "History",
	      icon: ClockCounterClockwise,
	      href: `/${slug}/history`,
	      tone: "text-[#f97316]",
	    },
	    {
	      title: "AI summaries",
	      icon: Sparkle,
	      href: `/${slug}/ai-summaries`,
	      tone: "text-[#a855f7]",
	    },
	    {
	      title: "Documents",
	      icon: FileText,
	      href: `/${slug}/documents`,
	      tone: "text-[#2563eb]",
	    },
	    {
	      title: "Members",
	      icon: Users,
	      href: `/${slug}/members`,
	      tone: "text-[#db2777]",
	    },
  ];

  if (isOwnerOrAdmin) {
    quickActions.push(
	      {
	        title: "Billing",
	        icon: CreditCard,
	        href: `/${slug}/billing`,
	        tone: "text-[#ef4444]",
	      },
	      {
	        title: "Dashboard",
	        icon: ChartBar,
	        href: `/${slug}/dashboard`,
	        tone: "text-[#4f46e5]",
	      },
	      {
	        title: "Settings",
	        icon: GearSix,
	        href: `/${slug}/settings`,
	        tone: "text-[#64748b]",
	      }
    );
  }

  return (
    <div className="min-h-full bg-canvas px-4 py-5 text-ink sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 pb-8">
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="flex flex-col gap-4"
        >
          <div className="min-w-0">
            <p className="mb-2 text-[12px] font-medium text-ink-muted">{activeWorkspaceName || "My Workspace"}</p>
            <h1 className="text-[34px] font-semibold leading-[1.05] tracking-normal text-ink sm:text-[42px]">
              Welcome,{" "}
              <span
                className="font-normal italic"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
              >
                {displayName}
              </span>
              <span className="ml-2 text-[28px] sm:text-[34px]">!</span>
            </h1>
            <p className="mt-3 max-w-[620px] text-[13px] leading-6 text-ink-muted sm:text-[14px]">
              Start a room, find a transcript, or jump into the workspace tools your team uses most.
            </p>
          </div>

        </motion.section>

	        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Quick jumps</h2>
              <p className="mt-1 text-[12px] text-ink-muted">The workspace shortcuts people use every day.</p>
            </div>
            <Link
              href={`/${slug}/rooms`}
              className="hidden items-center gap-1 text-[12px] font-semibold text-primary transition hover:text-ink sm:inline-flex"
            >
              Open meetings <ArrowRight size={13} />
            </Link>
          </div>

	          <div className="flex flex-wrap items-center gap-3">
	            {quickActions.map((action, index) => (
	              <QuickActionCard key={`${action.title}-${action.href || "action"}`} action={action} index={index} />
	            ))}
          </div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: 0.12 }}
          className="rounded-[16px] border border-border bg-surface-1 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
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
                              isLive ? "bg-[#e9f7ef] text-[#087443]" : "bg-surface-2 text-ink-muted"
                            )}
                          >
                            {isLive ? <span className="size-1.5 rounded-full bg-[#12b76a]" /> : null}
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
