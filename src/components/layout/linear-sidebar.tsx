"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";
import { useSelectWorkspace, useWorkspaceMembers, useWorkspaces } from "@/hooks/use-workspace";
import { useWorkspacePlugins } from "@/hooks/use-workspace-plugins";
import { pendingRequestBadge } from "@/lib/assistant/plugin-availability";
import { INVITE_SNOOZE_DAYS, shouldSuggestInvite } from "@/lib/onboarding/invite-suggestion";
import { applySelectedWorkspace } from "@/lib/workspace/apply-selected-workspace";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useUIStore } from "@/stores/ui-store";
import { useCanCreateMeetings, useWorkspaceStore } from "@/stores/workspace-store";
import type { IconProps } from "@phosphor-icons/react";
import {
  Archive,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  Check,
  CreditCard,
  ChartLine,
  Receipt,
  BookOpen,
  FileText,
  GearSix,
  Gauge,
  Globe,
  Handshake,
  Heartbeat,
  House,
  Keyboard,
  MagnifyingGlass,
  PaperPlaneTilt,
  EnvelopeSimple,
  PlugsConnected,
  PuzzlePiece,
  ClockCounterClockwise,
  SignOut,
  Plus,
  Sliders,
  SquaresFour,
  Star,
  Tray,
  User,
  Users,
  Waveform,
  X,
  Brain,
  Buildings,
  ShieldCheck,
  CheckSquare,
  Files,
  ListChecks,
  Bell,
  LinkSimple,
  Devices,} from "@phosphor-icons/react/dist/ssr";
import { AvatarPresenceDot } from "@/components/presence/presence-dot";
import { AccountMenu } from "@/components/layout/account-menu";
import { InviteMemberDialog } from "@/components/workspace/invite-member-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
type IconType = React.ElementType<IconProps>;

interface NavItem {
  icon: IconType;
  label: string;
  href: string;
  exact?: boolean;
  /**
   * Names this row for the product tour. An attribute rather than a CSS selector, so a layout
   * change moves the tour's target with the element instead of silently detaching it.
   */
  tourId?: string;
  /** A count beside the label (a dot on the collapsed rail), or null for none. */
  badge?: string | null;
  actions?: Array<{
    icon: IconType;
    href?: string;
    onClick?: () => void;
    title?: string;
    tourId?: string;
  }>;
}

/**
 * The one selected/hover treatment every sidebar row uses.
 *
 * The rail sits on `bg-canvas` (#f1f2f4), and the old selected fill was `bg-surface-2` (#f0f1f4) —
 * one step apart, so the row the reader was on was effectively invisible (owner, 2026-09-17: "sidebar
 * cần có selected như openai"). `surface-3` is the first level that reads against the canvas in
 * both themes, and the icon and label go to full ink so the selection does not rest on the fill
 * alone. Hover stays a lighter wash of the same colour, so hovered and selected never look alike.
 *
 * Fifteen settings rows used to spell the ternary out by hand, which is how they all drifted to
 * the invisible value together. They call this instead.
 */
function navRowTone(active: boolean): string {
  return active
    ? "bg-surface-3 text-ink [&_svg]:text-ink [&_span]:text-ink"
    : "hover:bg-surface-3/60";
}

type SidebarT = ReturnType<typeof useTranslations>;

function roleLabel(t: SidebarT, role: string | null | undefined): string {
  const key = role?.toLowerCase();
  if (key && t.has(`roleLabels.${key}`)) return t(`roleLabels.${key}`);
  return t("memberFallback");
}

function membershipLabel(t: SidebarT, membershipType: string | null | undefined): string {
  const key = membershipType?.toLowerCase();
  if (key && t.has(`membershipLabels.${key}`)) return t(`membershipLabels.${key}`);
  return t("internalFallback");
}

/**
 * The pending-count pill the mock gives Workspace → Plugins. Beside the label when expanded; on the
 * collapsed rail it rides the icon's corner, because there is no label to sit beside.
 */
function NavBadge({ count, collapsed = false }: { count: string; collapsed?: boolean }) {
  return (
    <span
      aria-label={`${count} pending`}
      className={cn(
        "grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-[5px] text-[11px] font-semibold leading-none text-panel",
        collapsed && "pointer-events-none absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]",
      )}
    >
      {count}
    </span>
  );
}

function NavLink({
  item,
  pathname,
  collapsed = false,
}: {
  item: NavItem;
  pathname: string;
  collapsed?: boolean;
}) {
  const isActive =
    pathname === item.href ||
    (!item.exact && pathname.startsWith(item.href + "/"));
  return (
    <div
      data-tour={item.tourId}
      className={cn(
        "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
        collapsed && "mx-auto size-9 justify-center rounded-full px-0",
        isActive
          ? collapsed
            ? "bg-surface-3 text-ink"
            : navRowTone(true)
          : navRowTone(false),
      )}
    >
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-2.5 flex-1 min-w-0 h-full",
          collapsed && "justify-center",
        )}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
      >
        <item.icon
          size={16}
          className={cn(
            "shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors",
            collapsed && isActive && "text-ink",
          )}
          weight="duotone"
        />
        {!collapsed && (
          <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
            {item.label}
          </span>
        )}
      </Link>
      {item.badge ? <NavBadge count={item.badge} collapsed={collapsed} /> : null}
      {!collapsed && item.actions && (
        <div className="flex items-center">
          {item.actions.map((action, i) => (
            action.onClick ? (
              <button
                key={i}
                type="button"
                title={action.title}
                data-tour={action.tourId}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-border/50 text-ink-muted hover:text-ink shrink-0 ml-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  action.onClick?.();
                }}
              >
                <action.icon size={14} weight="bold" />
              </button>
            ) : (
              <Link
                key={i}
                href={action.href || "#"}
                title={action.title}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-border/50 text-ink-muted hover:text-ink shrink-0 ml-1"
                onClick={(e) => e.stopPropagation()}
              >
                <action.icon size={14} weight="bold" />
              </Link>
            )
          ))}
        </div>
      )}
    </div>
  );
}

export function LinearSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations("common.sidebar");
  const pathname = usePathname();
  const setCreateRoomModalOpen = useUIStore((state) => state.setCreateRoomModalOpen);
  const canCreateMeetings = useCanCreateMeetings();
  const setSearchMeetingModalOpen = useUIStore((state) => state.setSearchMeetingModalOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isSystemAdmin = useIsSystemAdmin();
  const router = useRouter();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    setIsJoinModalOpen(false);
    router.push(`/join?code=${encodeURIComponent(trimmed)}`);
  }

  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const slug = activeWorkspaceSlug || "workspace";

  const mainNav: NavItem[] = [
    { icon: House, label: t("nav.home"), href: `/${slug}/home` },
    {
      icon: SquaresFour,
      label: t("nav.meetings"),
      href: `/${slug}/rooms`,
      tourId: "nav-meetings",
      actions: [
        { icon: Keyboard, onClick: () => setIsJoinModalOpen(true), title: t("nav.joinByCode") },
        // Join by code stays for everyone — an external collaborator is invited INTO meetings, they
        // just may not open them. WT-371 #2.
        ...(canCreateMeetings
          ? [
              {
                icon: Plus,
                onClick: () => setCreateRoomModalOpen(true),
                title: t("nav.createMeeting"),
                tourId: "nav-create-meeting",
              },
            ]
          : [])
      ]
    },
    // "Schedules" read as a list of schedule OBJECTS — recurrence rules — while the page is a
    // month/week grid of meetings. The route keeps its path: links already sent and the
    // placeholder contract point at /schedules, and the name a user never types is not worth
    // breaking those for.
    { icon: CalendarBlank, label: t("nav.schedules"), href: `/${slug}/schedules` },
    // No History row: /history was a second, worse answer to the question Artifacts answers —
    // it listed meetings, which Meetings above already does, and its outputs rail could not show
    // minutes at all. Past meetings are still browsable on Meetings, which asks for ENDED.
    // Artifacts, not "Transcripts". This entry used to be absent on purpose — "a meeting's
    // transcript, summary and files live on that meeting's own page, below its description" —
    // and that is still true: the record lives on the meeting, and this page links back to it.
    // What was missing was the INDEX. Every question a record is kept to answer ("which meeting
    // decided the budget?", "which meetings have a signed biên bản?") is a question about the
    // documents, and answering it meant opening meetings one at a time.
    //
    // Directly under History because the two are one archive read two ways: History lists the
    // MEETINGS, this lists what they wrote down.
    { icon: Files, label: t("nav.artifacts"), href: `/${slug}/artifacts` },
    { icon: Waveform, label: t("nav.voiceProfiles"), href: `/${slug}/voice-profiles`, tourId: "nav-voice-profiles" },
  ];

  const role = useWorkspaceStore((state) => state.role);
  const membershipType = useWorkspaceStore((state) => state.membershipType);
  const activeWorkspaceName = useWorkspaceStore((state) => state.activeWorkspaceName);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const isOwnerOrAdmin = role?.toLowerCase() === "owner" || role?.toLowerCase() === "admin";

  const { data: workspacesData } = useWorkspaces(1, 100);
  const workspaces = workspacesData?.items ?? [];

  /**
   * Whether to suggest inviting people, this visit.
   *
   * Page size 1: only `total` is read, and this query mounts on every screen in the app — the
   * sidebar is always there. The rule itself is in lib/onboarding/invite-suggestion.ts, seeded
   * so the answer holds still for a day rather than being re-rolled on every render.
   */
  const { data: memberPage } = useWorkspaceMembers(
    isOwnerOrAdmin && activeWorkspaceId ? activeWorkspaceId : undefined,
    1,
    1,
  );
  const inviteDismissedAt = useOnboardingStore((state) => state.inviteDismissedAt);
  const dismissInviteSuggestion = useOnboardingStore((state) => state.dismissInviteSuggestion);
  // The clock is read once per mount, not per render: `Date.now()` in the condition would make
  // the decision a moving target and defeat the point of seeding it by day.
  const [suggestionClock] = useState(() => Date.now());
  const suggestsInvite =
    Boolean(activeWorkspaceId) &&
    shouldSuggestInvite({
      workspaceId: activeWorkspaceId ?? "",
      memberCount: memberPage?.total ?? memberPage?.items?.length ?? 0,
      dismissedAtMs: inviteDismissedAt[activeWorkspaceId ?? ""] ?? null,
      nowMs: suggestionClock,
    });
  const selectWorkspaceMutation = useSelectWorkspace();

  const handleSelectWorkspace = async (workspaceId: string) => {
    try {
      const res = await selectWorkspaceMutation.mutateAsync(workspaceId);
      applySelectedWorkspace(res, setActiveWorkspace);
      toast.success(t("switchWorkspaceSuccess", { name: res.name }));
      router.push(`/${res.slug}/home`);
    } catch {
      toast.error(t("switchWorkspaceError"));
    }
  };


  const workspaceInitials = useMemo(() => {
    if (!activeWorkspaceName) return "WS";
    const parts = activeWorkspaceName.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return activeWorkspaceName.substring(0, 2).toUpperCase();
  }, [activeWorkspaceName]);

  const workspaceNav: NavItem[] = [];
  if (isOwnerOrAdmin) {
    // First, not last. Dashboard is the overview of everything under it, and it was sitting at
    // the bottom under Settings — the one entry that is not a place in the workspace but a
    // control panel for it. An overview reads as an overview when it comes before the things it
    // summarises.
    workspaceNav.push({
      icon: SquaresFour,
      label: t("nav.dashboard"),
      href: `/${slug}/dashboard`,
      tourId: "nav-dashboard",
    });
  }
  workspaceNav.push(
    { icon: Users, label: t("nav.members"), href: `/${slug}/members`, tourId: "nav-members" },
    { icon: FileText, label: t("nav.documents"), href: `/${slug}/documents`, tourId: "nav-documents" },
    // Directly under Documents, and visible to every member — the two are constantly mistaken for
    // each other, and sitting them together is what makes the difference legible: Documents is
    // content the assistant retrieves from afterwards, Glossary is terminology applied to speech
    // and translation while the meeting is happening.
    //
    // Its absence from this list is the whole reason the page was deleted as dead code, and the
    // whole reason it was then asked for: "tại k thấy ws glossary set up ở đâu". A feature nobody
    // can navigate to is indistinguishable from one that was never built.
    { icon: BookOpen, label: t("nav.glossary"), href: `/${slug}/glossary`, tourId: "nav-glossary" },
    // Work the meetings assigned to you, keyed on the person rather than the meeting. Listed here
    // for the same reason Glossary is: an endpoint no navigation reaches is indistinguishable
    // from one that was never built, and this list is the whole point of action items becoming
    // rows instead of sentences.
    { icon: CheckSquare, label: t("nav.myTasks"), href: `/${slug}/tasks`, tourId: "nav-tasks" }
  );

  if (isOwnerOrAdmin) {
    // No Invitations entry: invitations and join requests are rows on Members now, because
    // "who is in this workspace" and "who is on the way in" were never two questions.
    // What the system has indexed from this workspace's documents and meetings. Owner/Admin
    // only, because the view crosses per-document access policies.
    workspaceNav.push({ icon: Brain, label: t("nav.knowledge"), href: `/${slug}/knowledge`, tourId: "nav-knowledge" });
    // No Billing entry: WT-380 moved it inside Workspace Settings, where a plan, an invoice and a
    // credit balance belong. It is reached through Settings now, not from the app's main nav.
    //
    // Last in the list, and pushed after everything else so it stays last as entries are added.
    // Settings is where you go to change the workspace, not one of the places in it.
    workspaceNav.push({ icon: GearSix, label: t("nav.settings"), href: `/${slug}/settings` });
  }

  /**
   * Which of the two sidebars this screen gets.
   *
   * `/payment` is in the list because Billing lives under Settings now (WT-380) and its primary
   * action — choosing or changing a plan — navigates to `/{slug}/payment/plans`. Without this the
   * chrome would flip to the main app nav on the way, dropping the reader out of Settings at the
   * one moment they most need the way back to Billing.
   */
  // `/advanced` was a third entry here until its two cards moved to /settings/security on
  // 2026-09-16. Security lives under /settings, so `includes("/settings")` already covers it —
  // but the line had to go WITH the route: left behind it would have matched nothing, and
  // removed without moving the page it would have dropped the reader out of Settings.
  const isSettingsPage =
    pathname.includes("/settings") ||
    pathname.includes("/payment");

  // Workspace → Plugins badge: requests from members waiting on the Owner. Owner/Admin only, and only
  // while Settings is on screen — the one place the row is drawn — so no other page pays for the read.
  const { data: workspacePluginsOverview } = useWorkspacePlugins(
    activeWorkspaceId,
    isOwnerOrAdmin && isSettingsPage,
  );
  const pluginRequestBadge = pendingRequestBadge(workspacePluginsOverview);

  /**
   * The platform admin console gets its own chrome — a third branch beside the app and Settings.
   *
   * Without one, /admin inherited the app's nav wholesale: Home, Meetings, Schedules, History,
   * Voice Profiles, Members and Documents, every one of them scoped to whichever workspace the
   * admin happened to have open. A platform administrator is not standing *inside* a workspace,
   * so a workspace switcher and a workspace's meetings are not merely irrelevant there — they
   * invite the reader to act on one tenant while looking at a page about all of them.
   *
   * Gated on isSystemAdmin as well as the path. AdminLayout already refuses the page to everyone
   * else, and without this condition their sidebar would advertise a console beside an
   * "Access denied" panel.
   *
   * SCOPE: this lists the routes that EXIST. Users, Subscriptions, Plans, Meetings, Health,
   * Audit and Announcements each add their own entry with the release that adds the page — a nav
   * row pointing at a 404 is the same defect as a button whose endpoint was never routed.
   */
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminPage && isSystemAdmin) {
    const adminSections: Array<{ section: string; items: NavItem[] }> = [
      {
        section: "Platform",
        items: [
          // Exact, or every /admin/* page lights this row up too: NavLink treats a non-exact item
          // as active for anything beneath its href, and every admin page is beneath /admin.
          { icon: Gauge, label: "Overview", href: "/admin", exact: true },
          { icon: Buildings, label: "Workspaces", href: "/admin/workspaces" },
          // "Accounts", not "Users" (WT-444): this row lists every account on the platform, and
          // "Users" is the same word the workspace sidebar uses for that workspace's members —
          // two very different populations under one label, in a console where the difference is
          // the whole point. The route keeps its path; only what a person reads changes.
          { icon: Users, label: "Accounts", href: "/admin/users" },
        ],
      },
      {
        section: "Revenue",
        items: [
          { icon: Gauge, label: "Subscriptions", href: "/admin/subscriptions" },
          { icon: FileText, label: "Plans & pricing", href: "/admin/plans" },
          { icon: CreditCard, label: "Billing ledger", href: "/admin/billing" },
          { icon: Handshake, label: "Sales leads", href: "/admin/sales-leads" },
        ],
      },
      {
        section: "Operations",
        items: [
          { icon: SquaresFour, label: "Meetings", href: "/admin/meetings" },
          { icon: Heartbeat, label: "System health", href: "/admin/health" },
          { icon: Tray, label: "Event outbox", href: "/admin/outbox" },
          { icon: Star, label: "Feedback", href: "/admin/feedback" },
          { icon: Archive, label: "Audit log", href: "/admin/audit" },
          { icon: PaperPlaneTilt, label: "Announcements", href: "/admin/announcements" },
          { icon: EnvelopeSimple, label: "Email templates", href: "/admin/email-templates" },
        ],
      },
      {
        section: "Configuration",
        items: [
          // One row, not two. "Platform config" was a second route for the same subject — the
          // read-only half — and an admin looking for what the platform is configured to do had to
          // guess which of the two words it lived under. Merged into the page below on 2026-09-16;
          // the read-only boundary is now a band inside it.
          { icon: GearSix, label: "Platform settings", href: "/admin/settings" },
          // Beside Platform config because it is the same kind of thing: reference data the whole
          // platform runs on. Unlike that page it is writable, which is the point of WT-646 — the
          // catalog could only ever be INSERTed into, so a wrong OAuth client id in production was
          // a SQL job rather than a screen.
          { icon: PlugsConnected, label: "Plugins", href: "/admin/plugins" },
          { icon: Globe, label: "Global glossary", href: "/admin/global-glossary" },
        ],
      },
    ];

    // WT-444: "Back to app" pointed at /workspace whenever no workspace was active, and for the
    // only person who ever sees this button that is a loop. /workspace redirects a system admin
    // straight back to /admin — unconditionally, by WT-417 — so the button returned the admin to
    // the console they were trying to leave, with a page flash in between.
    //
    // Fall back to any workspace they actually belong to instead. A platform admin with none has
    // no app to go back to, so the button is not rendered at all rather than made to look
    // clickable: WT-417's whole point is that such an account is not a workspace user.
    const fallbackWorkspaceSlug = workspaces.find((w) => w.slug)?.slug;
    const backHref = activeWorkspaceSlug
      ? `/${activeWorkspaceSlug}/home`
      : fallbackWorkspaceSlug
        ? `/${fallbackWorkspaceSlug}/home`
        : null;

    if (collapsed) {
      return (
        <aside className="flex h-full w-16 shrink-0 select-none flex-col border-r border-border/40 bg-canvas text-ink">
          <div className="grid h-12 shrink-0 place-items-center border-b border-border/30">
            {backHref && (
              <Link
                href={backHref}
                title="Back to app"
                aria-label="Back to app"
                className="grid size-9 place-items-center rounded-[8px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <CaretLeft size={16} weight="bold" />
              </Link>
            )}
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
            {adminSections.flatMap((group, groupIndex) =>
              group.items.map((item, itemIndex) => (
                <div
                  key={item.href}
                  className={cn(
                    groupIndex > 0 && itemIndex === 0 && "mt-3 border-t border-border/50 pt-3",
                  )}
                >
                  <NavLink item={item} pathname={pathname} collapsed />
                </div>
              )),
            )}
          </nav>
          {/* The exit. The expanded branch hangs it off the user card; collapsed has no card,
              so the button stands alone — an admin console with no way to sign out is how the
              portal shipped once already. */}
          <div className="grid shrink-0 place-items-center border-t border-border/30 py-3">
            <button
              onClick={() => logout()}
              title="Log out"
              aria-label="Log out"
              className="grid size-9 place-items-center rounded-[8px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <SignOut size={16} weight="duotone" />
            </button>
          </div>
        </aside>
      );
    }

    return (
      <aside className="flex h-full w-[224px] shrink-0 select-none flex-col border-r border-border/40 bg-canvas font-sans text-ink antialiased">
        <div className="flex h-[48px] shrink-0 items-center border-b border-border/30 px-3">
          {backHref ? (
            <Link
              href={backHref}
              className="-ml-1.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <CaretLeft size={14} weight="bold" />
              <span>Back to app</span>
            </Link>
          ) : (
            // Same height and padding as the link so the header does not jump between an admin
            // who has a workspace and one who does not.
            <span className="-ml-1.5 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[13px] font-medium text-ink-muted/50">
              Platform console
            </span>
          )}
        </div>

        {/* Names the console, where the app's chrome names the workspace. Deliberately NOT a
            switcher: there is no workspace to switch, and a control that looks like one here
            would suggest this page is scoped to a tenant. */}
        <div className="flex items-center gap-2.5 border-b border-border/30 px-4 py-3">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-primary text-primary-foreground">
            <ShieldCheck size={13} weight="fill" />
          </span>
          <span className="truncate text-[13px] font-semibold tracking-tight text-ink">
            WarpTalk Platform
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {adminSections.map((group) => (
            <div key={group.section} className="mb-3">
              <div className="mb-1 flex h-[24px] items-center px-2">
                <span className="text-[12px] font-medium uppercase tracking-wider text-ink-subtle">
                  {group.section}
                </span>
              </div>
              <div className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {user && (
          <div className="group flex items-center gap-2.5 border-t border-border/30 px-3 py-3">
            <Avatar className="size-7 rounded-full">
              <AvatarImage src={user.avatarUrl} alt="" />
              <AvatarFallback className="rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[12.5px] font-medium text-ink">
                {user.fullName || user.email}
              </p>
              <p className="truncate text-[11px] text-ink-subtle">Platform admin</p>
            </div>
            {/* Always visible, not hover-revealed: this card is the ONLY exit from the portal,
                and a control nobody can see shipped once already as "no way to sign out". */}
            <button
              onClick={() => logout()}
              title="Log out"
              aria-label="Log out"
              className="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <SignOut size={16} weight="duotone" />
            </button>
          </div>
        )}
      </aside>
    );
  }

  if (isSettingsPage && collapsed) {
    const appHref = activeWorkspaceSlug
      ? `/${activeWorkspaceSlug}/rooms`
      : "/workspace";
    const settingsItems: NavItem[] = [
      {
        icon: Sliders,
        label: t("settingsNav.preferences"),
        href: activeWorkspaceSlug
          ? `/${activeWorkspaceSlug}/settings/account/preferences`
          : "/workspace",
      },
      {
        icon: User,
        label: t("settingsNav.profile"),
        href: activeWorkspaceSlug
          ? `/${activeWorkspaceSlug}/settings/account/profile`
          : "/workspace",
      },
      {
        icon: Bell,
        label: t("settingsNav.notifications"),
        href: activeWorkspaceSlug
          ? `/${activeWorkspaceSlug}/settings/account/notifications`
          : "/workspace",
      },
      {
        icon: LinkSimple,
        label: t("settingsNav.connectedAccounts"),
        href: activeWorkspaceSlug
          ? `/${activeWorkspaceSlug}/settings/account/connected-accounts`
          : "/workspace",
      },
      {
        icon: Devices,
        label: t("settingsNav.sessionsDevices"),
        href: activeWorkspaceSlug
          ? `/${activeWorkspaceSlug}/settings/account/sessions`
          : "/workspace",
      },
      {
        icon: PlugsConnected,
        label: t("settingsNav.plugins"),
        href: "/settings/plugins",
      },
    ];

    if (isOwnerOrAdmin && activeWorkspaceSlug) {
      settingsItems.push({
        icon: GearSix,
        label: t("settingsNav.workspaceSettingsCollapsed"),
        // Exact, or `/settings/billing` would light this row up too — NavLink treats a nav item as
        // active for anything below its href, and every settings page is below this one.
        exact: true,
        href: `/${activeWorkspaceSlug}/settings`,
      });
      // The workspace's plugin list (marketplace, 2026-09-17), with the requests waiting on it.
      settingsItems.push({
        icon: PuzzlePiece,
        label: t("settingsNav.plugins"),
        exact: true,
        href: `/${activeWorkspaceSlug}/settings/plugins`,
        badge: pluginRequestBadge,
      });
      // Beside the workspace's plugin list because it is the record of what that list let through.
      settingsItems.push({
        icon: ClockCounterClockwise,
        label: t("settingsNav.pluginActivity"),
        href: `/${activeWorkspaceSlug}/settings/plugin-activity`,
      });
      settingsItems.push({
        icon: CreditCard,
        label: t("settingsNav.billing"),
        // Exact now that Usage and Invoices live BELOW it. Without this, NavLink's
        // treat-descendants-as-active rule lights Billing up while the reader is on either child,
        // and two rows in the same group read as selected at once.
        exact: true,
        href: `/${activeWorkspaceSlug}/settings/billing`,
      });
      settingsItems.push({
        icon: ChartLine,
        label: t("settingsNav.usage"),
        href: `/${activeWorkspaceSlug}/settings/billing/usage`,
      });
      settingsItems.push({
        icon: Receipt,
        label: t("settingsNav.invoices"),
        href: `/${activeWorkspaceSlug}/settings/billing/invoices`,
      });
      settingsItems.push({
        icon: ListChecks,
        label: t("settingsNav.features"),
        href: `/${activeWorkspaceSlug}/settings/features`,
      });
    }
    if (role?.toLowerCase() === "owner" && activeWorkspaceSlug) {
      settingsItems.push({
        icon: Users,
        label: t("settingsNav.memberRoles"),
        href: `/${activeWorkspaceSlug}/settings/member-roles`,
      });
    }
    // Security, not Advanced: Owner AND Admin, because an Admin reads the access settings and
    // changes the ones that are theirs to change. The owner-only half — verified domains and the
    // danger zone — gates itself inside the page.
    if (isOwnerOrAdmin && activeWorkspaceSlug) {
      settingsItems.push({
        icon: ShieldCheck,
        label: t("settingsNav.security"),
        href: `/${activeWorkspaceSlug}/settings/security`,
      });
      // Staff actions on this workspace. Same audience as the endpoint behind it.
      settingsItems.push({
        icon: ClockCounterClockwise,
        label: t("settingsNav.auditLog"),
        href: `/${activeWorkspaceSlug}/settings/audit-log`,
      });
    }

    return (
      <aside className="flex h-full w-16 shrink-0 select-none flex-col border-r border-border/40 bg-canvas text-ink">
        <div className="grid h-12 shrink-0 place-items-center border-b border-border/30">
          <Link
            href={appHref}
            title={t("settingsNav.backToApp")}
            aria-label={t("settingsNav.backToApp")}
            className="grid size-9 place-items-center rounded-[8px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <CaretLeft size={16} weight="bold" />
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
          {settingsItems.map((item) => (
            <div
              key={item.href}
              className={cn(
                // Keyed on the row, not its index, so Personal rows can be added above it.
                item.href === "/settings/plugins" && "mt-3 border-t border-border/50 pt-3",
              )}
            >
              <NavLink item={item} pathname={pathname} collapsed />
            </div>
          ))}
        </nav>
        {user && (
          <Link
            href={
              activeWorkspaceSlug
                ? `/${activeWorkspaceSlug}/settings/account/profile`
                : "/workspace"
            }
            title={user.fullName || t("profileFallback")}
            aria-label={user.fullName || t("profileFallback")}
            className="m-3 grid size-10 place-items-center rounded-xl border border-border/50 bg-surface-1 transition hover:border-border/80 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={user.avatarUrl} alt="" />
              <AvatarFallback className="rounded-lg bg-primary/10 text-[13px] font-semibold text-primary">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
              </AvatarFallback>
            </Avatar>
          </Link>
        )}
      </aside>
    );
  }

  if (isSettingsPage) {
    return (
      <aside className="flex flex-col w-[224px] bg-canvas text-ink h-full shrink-0 select-none border-r border-border/40 font-sans antialiased">
        {/* Back to App Button */}
        <div className="flex items-center px-3 h-[48px] shrink-0 border-b border-border/30">
          <Link
            href={activeWorkspaceSlug ? `/${activeWorkspaceSlug}/rooms` : "/workspace"}
            className="flex items-center gap-2 px-1.5 py-1 -ml-1.5 rounded-md text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer w-full"
          >
            <CaretLeft size={14} weight="bold" />
            <span>{t("settingsNav.backToApp")}</span>
          </Link>
        </div>

        {/* Settings Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-2 mb-2 flex items-center h-[24px]">
            <span className="text-[12px] font-medium text-ink-subtle uppercase tracking-wider">{t("settingsNav.personal")}</span>
          </div>

          <div className="flex flex-col gap-px">
            <div className={cn(
              "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
              navRowTone(pathname === `/${activeWorkspaceSlug}/settings/account/preferences`)
            )}>
              <Link href={activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings/account/preferences` : "/workspace"} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                <Sliders size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                  {t("settingsNav.settingsLabel")}
                </span>
              </Link>
            </div>

            <div className={cn(
              "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
              navRowTone(pathname === `/${activeWorkspaceSlug}/settings/account/profile`)
            )}>
              <Link href={activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings/account/profile` : "/workspace"} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                <User size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                  {t("settingsNav.profile")}
                </span>
              </Link>
            </div>

            <div className={cn(
              "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
              navRowTone(pathname === `/${activeWorkspaceSlug}/settings/account/notifications`)
            )}>
              <Link href={activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings/account/notifications` : "/workspace"} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                <Bell size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                  {t("settingsNav.notifications")}
                </span>
              </Link>
            </div>

            <div className={cn(
              "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
              navRowTone(pathname === `/${activeWorkspaceSlug}/settings/account/connected-accounts`)
            )}>
              <Link href={activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings/account/connected-accounts` : "/workspace"} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                <LinkSimple size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                  {t("settingsNav.connectedAccounts")}
                </span>
              </Link>
            </div>

            <div className={cn(
              "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
              navRowTone(pathname === `/${activeWorkspaceSlug}/settings/account/sessions`)
            )}>
              <Link href={activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings/account/sessions` : "/workspace"} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                <Devices size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                  {t("settingsNav.sessionsDevices")}
                </span>
              </Link>
            </div>

            <div className={cn(
              "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
              navRowTone(pathname === "/settings/plugins")
            )}>
              <Link href="/settings/plugins" className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                <PlugsConnected size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                  {t("settingsNav.plugins")}
                </span>
              </Link>
            </div>

            {/* Conditional workspace settings link inside Settings sidebar */}
            {isOwnerOrAdmin && activeWorkspaceSlug && (
              <>
                <div className="px-2 mt-6 mb-2 flex items-center h-[24px]">
                  <span className="text-[12px] font-medium text-ink-subtle uppercase tracking-wider">{t("settingsNav.workspaceSection")}</span>
                </div>
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                  navRowTone(pathname === `/${activeWorkspaceSlug}/settings`)
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <GearSix size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      {t("settingsNav.workspaceSettingsExpanded")}
                    </span>
                  </Link>
                </div>
                {/* The workspace's plugin list (marketplace, 2026-09-17): the Owner adds plugins here and
                    answers members' requests, which the badge counts. Owner/Admin. */}
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                  navRowTone(pathname === `/${activeWorkspaceSlug}/settings/plugins`)
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/plugins`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <PuzzlePiece size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      {t("settingsNav.plugins")}
                    </span>
                  </Link>
                  {pluginRequestBadge ? <NavBadge count={pluginRequestBadge} /> : null}
                </div>
                {/* Plugin activity sits beside the workspace's plugin list: it is the record of what
                    that list let through and refused. Owner/Admin. */}
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                  navRowTone(pathname === `/${activeWorkspaceSlug}/settings/plugin-activity`)
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/plugin-activity`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <ClockCounterClockwise size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      {t("settingsNav.pluginActivity")}
                    </span>
                  </Link>
                </div>
                {/* WT-380 — Billing belongs here, not on the app's main nav. `startsWith` rather
                    than `===` so the row stays lit while the reader is off buying a plan at
                    /payment/plans, which is where this page's primary action sends them. */}
                {/* Billing is EXACT now that Usage and Invoices sit below it. `startsWith` would
                    light this row while the reader is on either child, so two rows in the group
                    would read as selected at once. `/payment` still counts as Billing: it is where
                    the plan grid sends a buyer, and losing the highlight there is the one moment
                    they most need the way back. */}
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                  navRowTone(
                    pathname === `/${activeWorkspaceSlug}/settings/billing` ||
                      pathname.startsWith(`/${activeWorkspaceSlug}/payment`),
                  )
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/billing`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <CreditCard size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      {t("settingsNav.billing")}
                    </span>
                  </Link>
                </div>
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                  navRowTone(pathname === `/${activeWorkspaceSlug}/settings/billing/usage`)
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/billing/usage`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <ChartLine size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      {t("settingsNav.usage")}
                    </span>
                  </Link>
                </div>
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                  navRowTone(pathname === `/${activeWorkspaceSlug}/settings/billing/invoices`)
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/billing/invoices`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <Receipt size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      {t("settingsNav.invoices")}
                    </span>
                  </Link>
                </div>
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                  navRowTone(pathname === `/${activeWorkspaceSlug}/settings/features`)
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/features`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <ListChecks size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      {t("settingsNav.features")}
                    </span>
                  </Link>
                </div>
                {role?.toLowerCase() === "owner" && (
                  <div className={cn(
                    "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                    navRowTone(pathname === `/${activeWorkspaceSlug}/settings/member-roles`)
                  )}>
                    <Link href={`/${activeWorkspaceSlug}/settings/member-roles`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                      <Users size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                      <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">{t("settingsNav.memberRoles")}</span>
                    </Link>
                  </div>
                )}
                {isOwnerOrAdmin && (
                  <div className={cn(
                    "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                    navRowTone(pathname === `/${activeWorkspaceSlug}/settings/security`)
                  )}>
                    <Link href={`/${activeWorkspaceSlug}/settings/security`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                      <ShieldCheck size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                      <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                        {t("settingsNav.security")}
                      </span>
                    </Link>
                  </div>
                )}
                {isOwnerOrAdmin && (
                  <div className={cn(
                    "group flex items-center h-[30px] px-2 rounded-[8px] text-[13px] transition-colors relative",
                    navRowTone(pathname === `/${activeWorkspaceSlug}/settings/audit-log`)
                  )}>
                    <Link href={`/${activeWorkspaceSlug}/settings/audit-log`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                      <ClockCounterClockwise size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                      <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                        {t("settingsNav.auditLog")}
                      </span>
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </nav>

        {/* User Account Panel */}
        {user && (
          <div className="p-3 mt-auto shrink-0">
            <div
              onClick={() => setAccountMenuOpen(true)}
              className="flex items-center gap-2.5 bg-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-border/50 p-2 rounded-xl cursor-pointer transition-colors group relative hover:shadow-md hover:border-border/80"
            >
              <Avatar className="size-8 rounded-lg border border-border/50">
                <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-[13px] font-semibold">
                  {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[13px] font-medium text-ink truncate leading-tight">
                  {user.fullName}
                </span>
                <span className="text-[11px] text-ink-muted truncate leading-tight mt-0.5">
                  {user.email}
                </span>
                <span className="mt-0.5 truncate text-[10px] font-medium text-primary">
                  {roleLabel(t, role)}
                  {" · "}
                  {membershipLabel(t, membershipType)}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  logout();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink shrink-0 ml-1"
                title={t("signOut")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L204.69,120H104a8,8,0,0,0,0,16H204.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z"></path></svg>
              </button>
            </div>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 select-none flex-col bg-canvas text-ink",
        collapsed ? "w-16" : "w-[224px]",
        collapsed && "border-r border-border/40",
      )}
    >
      {/* Workspace Selector Dropdown */}
      <div
        className={cn(
          "flex h-[48px] shrink-0 items-center",
          collapsed ? "justify-center px-2" : "justify-between px-3",
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            title={
              collapsed ? activeWorkspaceName || t("switchWorkspaceLabel") : undefined
            }
            aria-label={
              collapsed ? activeWorkspaceName || t("switchWorkspaceLabel") : undefined
            }
            className={cn(
              "flex min-w-0 cursor-pointer items-center gap-2 rounded-md transition-colors hover:bg-surface-2",
              collapsed
                ? "size-9 justify-center p-0"
                : "-ml-1.5 max-w-[170px] px-1.5 py-1",
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded bg-gradient-to-br from-pink-500 to-rose-500 text-white border border-white/10",
                collapsed ? "size-7" : "size-5",
              )}
            >
              <span className="text-[10px] font-bold leading-none tracking-tight">
                {workspaceInitials}
              </span>
            </div>
            {!collapsed && (
              <>
                <span className="text-[14px] font-semibold text-ink truncate tracking-tight">
                  {activeWorkspaceName || t("workspaceFallback")}
                </span>
                <CaretDown
                  size={12}
                  className="text-ink-muted ml-1 shrink-0"
                  weight="bold"
                />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[230px] bg-popover border border-border shadow-md rounded-xl p-1 text-ink text-[13px]">
            {/* 1. Settings (Owner & Admin only) */}
            {isOwnerOrAdmin && (
              <DropdownMenuItem
                onClick={() => router.push(activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings` : "/workspace")}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
              >
                <span>{t("workspaceMenu.settings")}</span>
                <DropdownMenuShortcut className="text-[11px] text-ink-subtle font-mono">G then S</DropdownMenuShortcut>
              </DropdownMenuItem>
            )}

            {/* 2. Invite and manage members */}
            <DropdownMenuItem
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
            >
              <span>{t("workspaceMenu.inviteAndManageMembers")}</span>
            </DropdownMenuItem>

            {/* 3. Download desktop app */}
            <DropdownMenuItem
              onClick={() => {
                window.location.href = `${window.location.origin}/download`;
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
            >
              <span>{t("workspaceMenu.downloadDesktopApp")}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-border/60 my-1" />

            {/* 4. Switch workspace (Submenu) */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]">
                <span>{t("workspaceMenu.switchWorkspace")}</span>
                <DropdownMenuShortcut className="text-[11px] text-ink-subtle font-mono mr-1">O then W</DropdownMenuShortcut>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-[250px] bg-popover border border-border shadow-lg rounded-xl p-1 text-ink text-[13px]">
                {/* User email */}
                {user?.email && (
                  <div className="px-2.5 py-1.5 text-[12px] text-ink-muted font-normal truncate border-b border-border/40 mb-1">
                    {user.email}
                  </div>
                )}
                
                {/* Workspace list */}
                <div className="max-h-[200px] overflow-y-auto flex flex-col gap-0.5">
                  {workspaces.map((ws, idx) => {
                    const isSelected = ws.id === activeWorkspaceId;

                    return (
                      <DropdownMenuItem
                        key={ws.id}
                        onClick={() => handleSelectWorkspace(ws.id)}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13px]",
                          isSelected ? "bg-surface-2 font-medium text-ink" : "hover:bg-surface-2 text-ink"
                        )}
                      >
                        <div className="size-4 rounded bg-gradient-to-br from-pink-500/80 to-rose-500/80 flex items-center justify-center shrink-0 text-[8px] text-white font-bold">
                          {ws.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="truncate flex-1">{ws.name}</span>
                        {isSelected && <Check size={14} className="text-ink ml-auto shrink-0" weight="bold" />}
                        <span className="text-[11px] text-ink-subtle ml-1 font-mono">{idx + 1}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </div>

                <DropdownMenuSeparator className="bg-border/60 my-1" />
                <div className="px-2.5 py-1 text-[11px] font-medium text-ink-subtle">
                  {t("workspaceMenu.account")}
                </div>
                {/*
                  The gateway, not the create form. The label has always promised BOTH, and
                  creating now starts at the plan grid rather than at a name field — so the one
                  screen that offers join alongside the plan-first create route is the honest
                  destination for it.
                */}
                <DropdownMenuItem
                  onClick={() => router.push("/workspace")}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
                >
                  <span>{t("workspaceMenu.createOrJoinWorkspace")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/login")}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
                >
                  <span>{t("workspaceMenu.addAnAccount")}</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator className="bg-border/60 my-1" />

            {/* 5. Log out */}
            <DropdownMenuItem
              onClick={() => logout()}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
            >
              <span>{t("workspaceMenu.logOut")}</span>
              <DropdownMenuShortcut className="text-[11px] text-ink-subtle font-mono">Alt ⇧ Q</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!collapsed && (
          <div className="flex items-center gap-1.5 text-ink-muted shrink-0">
            <button
              onClick={() => setSearchMeetingModalOpen(true)}
              aria-label={t("searchMeetings")}
              className="flex size-7 items-center justify-center rounded-[6px] hover:bg-surface-2 hover:text-ink transition-colors"
            >
              <MagnifyingGlass size={16} weight="regular" />
            </button>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3">
        {collapsed && (
          <button
            type="button"
            onClick={() => setSearchMeetingModalOpen(true)}
            title={t("searchMeetings")}
            aria-label={t("searchMeetings")}
            className="mb-2 grid size-9 w-full place-items-center rounded-[6px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <MagnifyingGlass size={16} weight="regular" />
          </button>
        )}
        <div className="flex flex-col gap-[2px]">
          {mainNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </div>

        {collapsed ? (
          <div className="mx-2 my-3 h-px bg-border/60" />
        ) : (
          <div className="mt-6 mb-1 px-2 flex items-center h-[24px]">
            <span className="text-[12px] font-medium text-ink-subtle">
              {t("workspaceSection")}
            </span>
          </div>
        )}
        <div className="flex flex-col gap-px">
          {workspaceNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </div>

        {isSystemAdmin && (
          <>
            {collapsed ? (
              <div className="mx-2 my-3 h-px bg-border/60" />
            ) : (
              <div className="mt-6 mb-1 px-2 flex items-center h-[24px]">
                <span className="text-[12px] font-medium text-ink-subtle">
                  {t("platformSection")}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-px">
              <NavLink
                item={{
                  icon: Gauge,
                  label: t("adminQuickLinks.overview"),
                  href: "/admin",
                  exact: true,
                }}
                pathname={pathname}
                collapsed={collapsed}
              />
              <NavLink
                item={{
                  icon: Users,
                  label: t("adminQuickLinks.workspaces"),
                  href: "/admin/workspaces",
                }}
                pathname={pathname}
                collapsed={collapsed}
              />
              <NavLink
                item={{
                  icon: CreditCard,
                  label: t("adminQuickLinks.billing"),
                  href: "/admin/billing",
                }}
                pathname={pathname}
                collapsed={collapsed}
              />
              <NavLink
                item={{
                  icon: Globe,
                  label: t("adminQuickLinks.globalGlossary"),
                  href: "/admin/global-glossary",
                }}
                pathname={pathname}
                collapsed={collapsed}
              />
            </div>
          </>
        )}
      </nav>

      {/*
        A suggestion, not furniture.
        It used to render for every Owner and Admin on every screen forever, with no way to send
        it away — including for workspaces whose team was invited months ago. Now it appears on
        some days and not others (seeded by workspace and date, so it holds still rather than
        flickering), stops entirely once the workspace has a team, and has a dismiss that is
        remembered.

        The dismiss is a sibling of the card's button rather than a child: a button inside a
        button is invalid HTML, and browsers resolve it by dropping one of them.
      */}
      {isOwnerOrAdmin && activeWorkspaceId && suggestsInvite && !collapsed && (
        <div className="px-3 pb-2 pt-3">
          <div className="group relative">
            <button
              type="button"
              onClick={() => setIsInviteModalOpen(true)}
              className="w-full rounded-[14px] border border-border bg-surface-1 p-3 text-left shadow-linear transition hover:-translate-y-0.5 hover:border-hairline-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink-muted transition group-hover:bg-primary/10 group-hover:text-primary">
                <PaperPlaneTilt size={17} weight="duotone" />
              </span>
              <span className="mt-3 block text-[13px] font-semibold leading-5 text-ink">{t("inviteTeamMembers")}</span>
              <span className="mt-1 block pr-5 text-[12px] leading-5 text-ink-muted">
                {t("inviteTeamMembersBody")}
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                dismissInviteSuggestion(activeWorkspaceId, Date.now())
              }
              title={t("dismissInvite", { days: INVITE_SNOOZE_DAYS })}
              aria-label={t("dismissInviteAria")}
              className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-md text-ink-subtle opacity-0 transition hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 group-hover:opacity-100"
            >
              <X size={11} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {isOwnerOrAdmin && activeWorkspaceId && collapsed && (
        <div className="px-3 pb-1 pt-2">
          <button
            type="button"
            onClick={() => setIsInviteModalOpen(true)}
            title={t("inviteTeamMembers")}
            aria-label={t("inviteTeamMembers")}
            className="grid size-10 w-full place-items-center rounded-xl border border-border/50 bg-surface-1 text-ink-muted transition-colors hover:border-border/80 hover:bg-surface-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <PaperPlaneTilt size={17} weight="duotone" />
          </button>
        </div>
      )}

      {/* User Account Panel */}
      {user && (
        <div className="mt-auto shrink-0 p-3">
          <AccountMenu
            open={accountMenuOpen}
            onOpenChange={setAccountMenuOpen}
            user={user}
            workspaceId={activeWorkspaceId}
            workspaceSlug={activeWorkspaceSlug}
            role={role}
            membershipType={membershipType}
            onSignOut={logout}
            trigger={
          <div
            title={collapsed ? user.fullName || t("profileFallback") : undefined}
            aria-label={collapsed ? user.fullName || t("profileFallback") : undefined}
            className={cn(
              "flex items-center bg-surface-1 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-border/50 rounded-xl cursor-pointer transition-colors group relative hover:shadow-md hover:border-border/80",
              collapsed ? "justify-center p-1" : "gap-2.5 p-2",
            )}
          >
            {/* Your own dot, so the state everyone else sees for you is not a mystery. */}
            <div className="relative size-8 shrink-0">
              <Avatar className="size-8 rounded-lg border border-border/50">
                <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-[13px] font-semibold">
                  {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
                </AvatarFallback>
              </Avatar>
              <AvatarPresenceDot userId={user.id} />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[13px] font-medium text-ink truncate leading-tight">
                  {user.fullName}
                </span>
                <span className="text-[11px] text-ink-muted truncate leading-tight mt-0.5">
                  {user.email}
                </span>
                <span className="mt-0.5 truncate text-[10px] font-medium text-primary">
                  {roleLabel(t, role)}
                  {" · "}
                  {membershipLabel(t, membershipType)}
                </span>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  logout();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink shrink-0 ml-1"
                title={t("signOut")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L204.69,120H104a8,8,0,0,0,0,16H204.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z"></path>
                </svg>
              </button>
            )}
          </div>
            }
          />
        </div>
        )}

      {/* Join Room Dialog */}
      <Dialog open={isJoinModalOpen} onOpenChange={setIsJoinModalOpen}>
        <DialogContent className="sm:max-w-[425px] !top-[25%] !translate-y-[-25%]">
          <DialogHeader>
            <DialogTitle>{t("joinDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("joinDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleJoin} className="grid gap-4 pt-2">
            <div className="grid gap-2">
              <Label htmlFor="code" className="text-foreground font-medium text-[13px]">{t("joinDialog.codeLabel")}</Label>
              <Input
                id="code"
                placeholder={t("joinDialog.codePlaceholder")}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                autoComplete="off"
                autoFocus
                className="bg-surface-1"
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={!joinCode.trim()}
                className="disabled:bg-surface-2 disabled:text-ink-muted disabled:opacity-100 min-w-[80px] text-white"
              >
                {t("joinDialog.join")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <InviteMemberDialog
        open={isInviteModalOpen}
        onOpenChange={setIsInviteModalOpen}
        workspaceId={activeWorkspaceId || ""}
        workspaceName={activeWorkspaceName}
        canGrantAdmin={role?.toLowerCase() === "owner"}
      />
    </aside>
  );
}
