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
  Heartbeat,
  House,
  Keyboard,
  MagnifyingGlass,
  PaperPlaneTilt,
  PlugsConnected,
  SignOut,
  Plus,
  Sliders,
  SquaresFour,
  Star,
  User,
  Users,
  Warning,
  Waveform,
  X,
  Brain,
  Buildings,
  ShieldCheck,
  CheckSquare,} from "@phosphor-icons/react/dist/ssr";
import { AvatarPresenceDot } from "@/components/presence/presence-dot";
import { AccountMenu } from "@/components/layout/account-menu";
import { InviteMemberDialog } from "@/components/workspace/invite-member-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
  actions?: Array<{
    icon: IconType;
    href?: string;
    onClick?: () => void;
    title?: string;
    tourId?: string;
  }>;
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
        "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
        collapsed && "mx-auto size-9 justify-center rounded-full px-0",
        isActive
          ? collapsed
            ? "bg-surface-3 text-ink"
            : "bg-surface-2"
          : "hover:bg-surface-2",
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
    { icon: House, label: "Home", href: `/${slug}/home` },
    {
      icon: SquaresFour,
      label: "Meetings",
      href: `/${slug}/rooms`,
      tourId: "nav-meetings",
      actions: [
        { icon: Keyboard, onClick: () => setIsJoinModalOpen(true), title: "Join by code" },
        // Join by code stays for everyone — an external collaborator is invited INTO meetings, they
        // just may not open them. WT-371 #2.
        ...(canCreateMeetings
          ? [
              {
                icon: Plus,
                onClick: () => setCreateRoomModalOpen(true),
                title: "Create Meeting",
                tourId: "nav-create-meeting",
              },
            ]
          : [])
      ]
    },
    { icon: CalendarBlank, label: "Schedules", href: `/${slug}/schedules` },
    { icon: Archive, label: "History", href: `/${slug}/history` },
    // No Transcripts entry: a meeting's transcript, summary and files live on that
    // meeting's own page, below its description.
    { icon: Waveform, label: "Voice Profiles", href: `/${slug}/voice-profiles`, tourId: "nav-voice-profiles" },
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
      toast.success(`Switched to workspace "${res.name}"`);
      router.push(`/${res.slug}/home`);
    } catch {
      toast.error("Failed to switch workspace");
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
      label: "Dashboard",
      href: `/${slug}/dashboard`,
      tourId: "nav-dashboard",
    });
  }
  workspaceNav.push(
    { icon: Users, label: "Members", href: `/${slug}/members`, tourId: "nav-members" },
    { icon: FileText, label: "Documents", href: `/${slug}/documents`, tourId: "nav-documents" },
    // Directly under Documents, and visible to every member — the two are constantly mistaken for
    // each other, and sitting them together is what makes the difference legible: Documents is
    // content the assistant retrieves from afterwards, Glossary is terminology applied to speech
    // and translation while the meeting is happening.
    //
    // Its absence from this list is the whole reason the page was deleted as dead code, and the
    // whole reason it was then asked for: "tại k thấy ws glossary set up ở đâu". A feature nobody
    // can navigate to is indistinguishable from one that was never built.
    { icon: BookOpen, label: "Glossary", href: `/${slug}/glossary`, tourId: "nav-glossary" },
    // Work the meetings assigned to you, keyed on the person rather than the meeting. Listed here
    // for the same reason Glossary is: an endpoint no navigation reaches is indistinguishable
    // from one that was never built, and this list is the whole point of action items becoming
    // rows instead of sentences.
    { icon: CheckSquare, label: "My tasks", href: `/${slug}/tasks`, tourId: "nav-tasks" }
  );

  if (isOwnerOrAdmin) {
    // No Invitations entry: invitations and join requests are rows on Members now, because
    // "who is in this workspace" and "who is on the way in" were never two questions.
    // What the system has indexed from this workspace's documents and meetings. Owner/Admin
    // only, because the view crosses per-document access policies.
    workspaceNav.push({ icon: Brain, label: "Knowledge", href: `/${slug}/knowledge`, tourId: "nav-knowledge" });
    // No Billing entry: WT-380 moved it inside Workspace Settings, where a plan, an invoice and a
    // credit balance belong. It is reached through Settings now, not from the app's main nav.
    //
    // Last in the list, and pushed after everything else so it stays last as entries are added.
    // Settings is where you go to change the workspace, not one of the places in it.
    workspaceNav.push({ icon: GearSix, label: "Settings", href: `/${slug}/settings` });
  }

  /**
   * Which of the two sidebars this screen gets.
   *
   * `/payment` is in the list because Billing lives under Settings now (WT-380) and its primary
   * action — choosing or changing a plan — navigates to `/{slug}/payment/plans`. Without this the
   * chrome would flip to the main app nav on the way, dropping the reader out of Settings at the
   * one moment they most need the way back to Billing.
   */
  const isSettingsPage =
    pathname.includes("/settings") ||
    pathname.includes("/advanced") ||
    pathname.includes("/payment");

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
        ],
      },
      {
        section: "Operations",
        items: [
          { icon: SquaresFour, label: "Meetings", href: "/admin/meetings" },
          { icon: Heartbeat, label: "System health", href: "/admin/health" },
          { icon: Star, label: "Feedback", href: "/admin/feedback" },
          { icon: Archive, label: "Audit log", href: "/admin/audit" },
          { icon: PaperPlaneTilt, label: "Announcements", href: "/admin/announcements" },
        ],
      },
      {
        section: "Configuration",
        items: [
          { icon: GearSix, label: "Platform settings", href: "/admin/settings" },
          { icon: Sliders, label: "Platform config", href: "/admin/configuration" },
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
        label: "Preferences",
        href: activeWorkspaceSlug
          ? `/${activeWorkspaceSlug}/settings/account/preferences`
          : "/workspace",
      },
      {
        icon: User,
        label: "Profile",
        href: activeWorkspaceSlug
          ? `/${activeWorkspaceSlug}/settings/account/profile`
          : "/workspace",
      },
      {
        icon: PlugsConnected,
        label: "Plugins",
        href: "/settings/plugins",
      },
    ];

    if (isOwnerOrAdmin && activeWorkspaceSlug) {
      settingsItems.push({
        icon: GearSix,
        label: "Workspace settings",
        // Exact, or `/settings/billing` would light this row up too — NavLink treats a nav item as
        // active for anything below its href, and every settings page is below this one.
        exact: true,
        href: `/${activeWorkspaceSlug}/settings`,
      });
      settingsItems.push({
        icon: CreditCard,
        label: "Billing",
        // Exact now that Usage and Invoices live BELOW it. Without this, NavLink's
        // treat-descendants-as-active rule lights Billing up while the reader is on either child,
        // and two rows in the same group read as selected at once.
        exact: true,
        href: `/${activeWorkspaceSlug}/settings/billing`,
      });
      settingsItems.push({
        icon: ChartLine,
        label: "Usage",
        href: `/${activeWorkspaceSlug}/settings/billing/usage`,
      });
      settingsItems.push({
        icon: Receipt,
        label: "Invoices",
        href: `/${activeWorkspaceSlug}/settings/billing/invoices`,
      });
    }
    if (role?.toLowerCase() === "owner" && activeWorkspaceSlug) {
      settingsItems.push({
        icon: Users,
        label: "Member roles",
        href: `/${activeWorkspaceSlug}/settings/member-roles`,
      });
    }
    if (role?.toLowerCase() === "owner" && activeWorkspaceSlug) {
      settingsItems.push({
        icon: Warning,
        label: "Advanced",
        href: `/${activeWorkspaceSlug}/advanced`,
      });
    }

    return (
      <aside className="flex h-full w-16 shrink-0 select-none flex-col border-r border-border/40 bg-canvas text-ink">
        <div className="grid h-12 shrink-0 place-items-center border-b border-border/30">
          <Link
            href={appHref}
            title="Back to app"
            aria-label="Back to app"
            className="grid size-9 place-items-center rounded-[8px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <CaretLeft size={16} weight="bold" />
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
          {settingsItems.map((item, index) => (
            <div
              key={item.href}
              className={cn(
                index === 2 && "mt-3 border-t border-border/50 pt-3",
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
            title={user.fullName || "Profile"}
            aria-label={user.fullName || "Profile"}
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
            <span>Back to app</span>
          </Link>
        </div>

        {/* Settings Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-2 mb-2 flex items-center h-[24px]">
            <span className="text-[12px] font-medium text-ink-subtle uppercase tracking-wider">Personal</span>
          </div>

          <div className="flex flex-col gap-px">
            <div className={cn(
              "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
              pathname === `/${activeWorkspaceSlug}/settings/account/preferences` ? "bg-surface-2" : "hover:bg-surface-2"
            )}>
              <Link href={activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings/account/preferences` : "/workspace"} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                <Sliders size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                  Settings
                </span>
              </Link>
            </div>

            <div className={cn(
              "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
              pathname === `/${activeWorkspaceSlug}/settings/account/profile` ? "bg-surface-2" : "hover:bg-surface-2"
            )}>
              <Link href={activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings/account/profile` : "/workspace"} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                <User size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                  Profile
                </span>
              </Link>
            </div>

            <div className={cn(
              "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
              pathname === "/settings/plugins" ? "bg-surface-2" : "hover:bg-surface-2"
            )}>
              <Link href="/settings/plugins" className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                <PlugsConnected size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                  Plugins
                </span>
              </Link>
            </div>

            {/* Conditional workspace settings link inside Settings sidebar */}
            {isOwnerOrAdmin && activeWorkspaceSlug && (
              <>
                <div className="px-2 mt-6 mb-2 flex items-center h-[24px]">
                  <span className="text-[12px] font-medium text-ink-subtle uppercase tracking-wider">Workspace</span>
                </div>
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
                  pathname === `/${activeWorkspaceSlug}/settings` ? "bg-surface-2" : "hover:bg-surface-2"
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <GearSix size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      Workspace Settings
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
                  "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
                  pathname === `/${activeWorkspaceSlug}/settings/billing` ||
                    pathname.startsWith(`/${activeWorkspaceSlug}/payment`)
                    ? "bg-surface-2"
                    : "hover:bg-surface-2"
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/billing`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <CreditCard size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      Billing
                    </span>
                  </Link>
                </div>
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
                  pathname === `/${activeWorkspaceSlug}/settings/billing/usage` ? "bg-surface-2" : "hover:bg-surface-2"
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/billing/usage`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <ChartLine size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      Usage
                    </span>
                  </Link>
                </div>
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
                  pathname === `/${activeWorkspaceSlug}/settings/billing/invoices` ? "bg-surface-2" : "hover:bg-surface-2"
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/billing/invoices`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <Receipt size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      Invoices
                    </span>
                  </Link>
                </div>
                {role?.toLowerCase() === "owner" && (
                  <div className={cn(
                    "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
                    pathname === `/${activeWorkspaceSlug}/settings/member-roles` ? "bg-surface-2" : "hover:bg-surface-2"
                  )}>
                    <Link href={`/${activeWorkspaceSlug}/settings/member-roles`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                      <Users size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                      <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">Member roles</span>
                    </Link>
                  </div>
                )}
                {role?.toLowerCase() === "owner" && (
                  <div className={cn(
                    "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
                    pathname === `/${activeWorkspaceSlug}/advanced` ? "bg-surface-2 text-destructive" : "hover:bg-surface-2 hover:text-destructive"
                  )}>
                    <Link href={`/${activeWorkspaceSlug}/advanced`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                      <Warning size={16} className="shrink-0 text-destructive/80 group-hover:text-destructive transition-colors" weight="duotone" />
                      <span className="font-medium tracking-tight text-ink/90 group-hover:text-destructive transition-colors truncate">
                        Advanced
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
                  {role ? `${role.charAt(0).toUpperCase()}${role.slice(1).toLowerCase()}` : "Member"}
                  {" · "}
                  {membershipType
                    ? `${membershipType.charAt(0).toUpperCase()}${membershipType.slice(1).toLowerCase()}`
                    : "Internal"}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  logout();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink shrink-0 ml-1"
                title="Sign out"
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
              collapsed ? activeWorkspaceName || "Switch workspace" : undefined
            }
            aria-label={
              collapsed ? activeWorkspaceName || "Switch workspace" : undefined
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
                  {activeWorkspaceName || "Workspace"}
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
                <span>Settings</span>
                <DropdownMenuShortcut className="text-[11px] text-ink-subtle font-mono">G then S</DropdownMenuShortcut>
              </DropdownMenuItem>
            )}

            {/* 2. Invite and manage members */}
            <DropdownMenuItem
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
            >
              <span>Invite and manage members</span>
            </DropdownMenuItem>

            {/* 3. Download desktop app */}
            <DropdownMenuItem
              onClick={() => {
                window.location.href = `${window.location.origin}/download`;
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
            >
              <span>Download desktop app</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-border/60 my-1" />

            {/* 4. Switch workspace (Submenu) */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]">
                <span>Switch workspace</span>
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
                  Account
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
                  <span>Create or join a workspace...</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/login")}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
                >
                  <span>Add an account...</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator className="bg-border/60 my-1" />

            {/* 5. Log out */}
            <DropdownMenuItem
              onClick={() => logout()}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
            >
              <span>Log out</span>
              <DropdownMenuShortcut className="text-[11px] text-ink-subtle font-mono">Alt ⇧ Q</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!collapsed && (
          <div className="flex items-center gap-1.5 text-ink-muted shrink-0">
            <button
              onClick={() => setSearchMeetingModalOpen(true)}
              aria-label="Search meetings"
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
            title="Search meetings"
            aria-label="Search meetings"
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
              Workspace
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
                  Platform
                </span>
              </div>
            )}
            <div className="flex flex-col gap-px">
              <NavLink
                item={{
                  icon: Gauge,
                  label: "Overview",
                  href: "/admin",
                  exact: true,
                }}
                pathname={pathname}
                collapsed={collapsed}
              />
              <NavLink
                item={{
                  icon: Users,
                  label: "Workspaces",
                  href: "/admin/workspaces",
                }}
                pathname={pathname}
                collapsed={collapsed}
              />
              <NavLink
                item={{
                  icon: CreditCard,
                  label: "Billing",
                  href: "/admin/billing",
                }}
                pathname={pathname}
                collapsed={collapsed}
              />
              <NavLink
                item={{
                  icon: Globe,
                  label: "Global Glossary",
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
              <span className="mt-3 block text-[13px] font-semibold leading-5 text-ink">Invite team members</span>
              <span className="mt-1 block pr-5 text-[12px] leading-5 text-ink-muted">
                Bring your team in to collaborate and share workspace rooms.
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                dismissInviteSuggestion(activeWorkspaceId, Date.now())
              }
              title={`Dismiss for ${INVITE_SNOOZE_DAYS} days`}
              aria-label="Dismiss the invite suggestion"
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
            title="Invite team members"
            aria-label="Invite team members"
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
            title={collapsed ? user.fullName || "Profile" : undefined}
            aria-label={collapsed ? user.fullName || "Profile" : undefined}
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
                  {role
                    ? `${role.charAt(0).toUpperCase()}${role.slice(1).toLowerCase()}`
                    : "Member"}
                  {" · "}
                  {membershipType
                    ? `${membershipType.charAt(0).toUpperCase()}${membershipType.slice(1).toLowerCase()}`
                    : "Internal"}
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
                title="Sign out"
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
            <DialogTitle>Join Translation Room</DialogTitle>
            <DialogDescription>
              Enter the meeting code provided by your host to join the room.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleJoin} className="grid gap-4 pt-2">
            <div className="grid gap-2">
              <Label htmlFor="code" className="text-foreground font-medium text-[13px]">Meeting code</Label>
              <Input
                id="code"
                placeholder="e.g. ROOM-abc-123"
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
                Join
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
