"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  useInviteWorkspaceMember,
  useSelectWorkspace,
  useWorkspaces,
} from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { IconProps } from "@phosphor-icons/react";
import {
  CaretDown,
  CaretLeft,
  Check,
  CreditCard,
  Desktop,
  EnvelopeSimple,
  FileText,
  GearSix,
  Gauge,
  Globe,
  House,
  Keyboard,
  MagnifyingGlass,
  Translate,
  PaperPlaneTilt,
  Plus,
  Scroll,
  SignOut,
  Sliders,
  SquaresFour,
  User,
  UserPlus,
  Users,
  Warning,
  Waveform,
} from "@phosphor-icons/react/dist/ssr";
import { AvatarPresenceDot } from "@/components/presence/presence-dot";
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
  actions?: Array<{
    icon: IconType;
    href?: string;
    onClick?: () => void;
    title?: string;
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
  const setSearchMeetingModalOpen = useUIStore((state) => state.setSearchMeetingModalOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isSystemAdmin = useIsSystemAdmin();
  const router = useRouter();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleName, setInviteRoleName] = useState("Member");
  // Set once an invitation is created and the server returns its token. The plaintext is
  // never retrievable again — the row keeps only a hash — so the dialog stays on it until
  // the inviter dismisses it.
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkEmail, setInviteLinkEmail] = useState("");
  const [inviteLinkDelivered, setInviteLinkDelivered] = useState(true);

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
      actions: [
        { icon: Keyboard, onClick: () => setIsJoinModalOpen(true), title: "Join by code" },
        { icon: Plus, onClick: () => setCreateRoomModalOpen(true), title: "Create Meeting" }
      ]
    },
    { icon: Scroll, label: "Transcripts", href: `/${slug}/ai-summaries` },
    { icon: Waveform, label: "Voice Profiles", href: "/voice-profiles" },
  ];

  const role = useWorkspaceStore((state) => state.role);
  const membershipType = useWorkspaceStore((state) => state.membershipType);
  const activeWorkspaceName = useWorkspaceStore((state) => state.activeWorkspaceName);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const isOwnerOrAdmin = role?.toLowerCase() === "owner" || role?.toLowerCase() === "admin";

  const { data: workspacesData } = useWorkspaces(1, 100);
  const workspaces = workspacesData?.items ?? [];
  const selectWorkspaceMutation = useSelectWorkspace();
  const inviteMemberMutation = useInviteWorkspaceMember(activeWorkspaceId || "");

  const handleSelectWorkspace = async (workspaceId: string, name: string, slug: string, roleName: string, membershipType: string, defaultLanguage: string) => {
    try {
      const res = await selectWorkspaceMutation.mutateAsync(workspaceId);
      setActiveWorkspace(workspaceId, name, slug, roleName, membershipType, res.defaultLanguage || defaultLanguage);
      toast.success(`Switched to workspace "${name}"`);
      router.push(`/${slug}/home`);
    } catch {
      toast.error("Failed to switch workspace");
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!activeWorkspaceId || !email) return;

    try {
      const response = await inviteMemberMutation.mutateAsync({
        email,
        roleName: inviteRoleName,
      });

      // Delivery can fail while the invitation itself is perfectly valid — the server says
      // so in `warning`. Reporting "Invitation sent" in that case is a lie the recipient
      // pays for, so the two outcomes are told apart.
      const delivered = !response?.warning;
      const token = response?.rawToken;

      if (token) {
        // Keep the dialog open on the link. Closing it would throw away the one moment the
        // plaintext token exists — it is never returned again, and the row stores only a hash.
        setInviteLink(`${window.location.origin}/invitations/${token}`);
        setInviteLinkEmail(email);
        setInviteLinkDelivered(delivered);
      } else {
        // Server without the token change: behave exactly as before.
        toast[delivered ? "success" : "warning"](
          delivered
            ? `Invitation sent to ${email}`
            : `Invitation created for ${email}, but the email could not be delivered.`,
        );
        setInviteEmail("");
        setInviteRoleName("Member");
        setIsInviteModalOpen(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send invitation";
      toast.error(message);
    }
  };

  const resetInviteDialog = () => {
    setInviteEmail("");
    setInviteRoleName("Member");
    setInviteLink(null);
    setInviteLinkEmail("");
    setInviteLinkDelivered(true);
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
  workspaceNav.push(
    { icon: Users, label: "Members", href: `/${slug}/members` },
    { icon: FileText, label: "Documents", href: `/${slug}/documents` }
  );

  if (isOwnerOrAdmin) {
    workspaceNav.push({ icon: EnvelopeSimple, label: "Invitations", href: `/${slug}/invitations` });
    workspaceNav.push({ icon: GearSix, label: "Settings", href: `/${slug}/settings` });
    workspaceNav.push({ icon: SquaresFour, label: "Dashboard", href: `/${slug}/dashboard` });
  }

  const isSettingsPage = pathname.includes("/settings") || pathname.includes("/advanced");

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
    ];

    if (isOwnerOrAdmin && activeWorkspaceSlug) {
      settingsItems.push({
        icon: GearSix,
        label: "Workspace settings",
        href: `/${activeWorkspaceSlug}/settings`,
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
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
                  pathname === `/${activeWorkspaceSlug}/settings/billing` ? "bg-surface-2" : "hover:bg-surface-2"
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
                  pathname === `/${activeWorkspaceSlug}/settings/usage` ? "bg-surface-2" : "hover:bg-surface-2"
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/usage`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <Gauge size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      Usage
                    </span>
                  </Link>
                </div>
                <div className={cn(
                  "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
                  pathname === `/${activeWorkspaceSlug}/settings/languages` ? "bg-surface-2" : "hover:bg-surface-2"
                )}>
                  <Link href={`/${activeWorkspaceSlug}/settings/languages`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                    <Translate size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                    <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">
                      Languages
                    </span>
                  </Link>
                </div>
                {role?.toLowerCase() === "owner" && (
                  <div className={cn(
                    "group flex items-center h-[30px] px-2 rounded-[6px] text-[13px] transition-colors relative",
                    pathname === `/${activeWorkspaceSlug}/settings/access-management` ? "bg-surface-2" : "hover:bg-surface-2"
                  )}>
                    <Link href={`/${activeWorkspaceSlug}/settings/access-management`} className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
                      <Users size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
                      <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors truncate">Manage access</span>
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
              onClick={() => router.push(activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings/account/profile` : "/workspace")}
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
            {/* 1. Settings */}
            <DropdownMenuItem
              onClick={() => router.push(activeWorkspaceSlug ? `/${activeWorkspaceSlug}/settings` : "/workspace")}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-ink text-[13px]"
            >
              <span>Settings</span>
              <DropdownMenuShortcut className="text-[11px] text-ink-subtle font-mono">G then S</DropdownMenuShortcut>
            </DropdownMenuItem>

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
                    const membershipType =
                      "membershipType" in ws && typeof ws.membershipType === "string"
                        ? ws.membershipType
                        : "Internal";
                    const isSelected = ws.id === activeWorkspaceId;

                    return (
                      <DropdownMenuItem
                        key={ws.id}
                        onClick={() => handleSelectWorkspace(ws.id, ws.name, ws.slug, ws.role || "Member", membershipType, ws.defaultLanguage || "en")}
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
                <DropdownMenuItem
                  onClick={() => router.push("/workspace/create")}
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
              <NavLink
                item={{
                  icon: Translate,
                  label: "System Languages",
                  href: "/admin/languages",
                }}
                pathname={pathname}
                collapsed={collapsed}
              />
            </div>
          </>
        )}
      </nav>

      {isOwnerOrAdmin && activeWorkspaceId && !collapsed && (
        <div className="px-3 pb-2 pt-3">
          <button
            type="button"
            onClick={() => setIsInviteModalOpen(true)}
            className="group w-full rounded-[14px] border border-border bg-surface-1 p-3 text-left shadow-linear transition hover:-translate-y-0.5 hover:border-hairline-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink-muted transition group-hover:bg-primary/10 group-hover:text-primary">
              <PaperPlaneTilt size={17} weight="duotone" />
            </span>
            <span className="mt-3 block text-[13px] font-semibold leading-5 text-ink">Invite team members</span>
            <span className="mt-1 block text-[12px] leading-5 text-ink-muted">
              Bring your team in to collaborate and share workspace rooms.
            </span>
          </button>
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
          <div
            onClick={() =>
              router.push(
                activeWorkspaceSlug
                  ? `/${activeWorkspaceSlug}/settings/account/profile`
                  : "/workspace",
              )
            }
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

      {/*
        Reset on close, not just on the Done button. Dismissing with Escape or the X would
        otherwise leave the previous invitee's link in state, and the next person to open
        this dialog would be shown a link addressed to someone else.
      */}
      <Dialog
        open={isInviteModalOpen}
        onOpenChange={(open) => {
          if (!open) resetInviteDialog();
          setIsInviteModalOpen(open);
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-[520px]">
          <div className="h-36 border-b border-border bg-[radial-gradient(circle_at_28%_18%,rgba(94,106,210,0.30),transparent_34%),radial-gradient(circle_at_78%_22%,rgba(16,185,129,0.18),transparent_30%),linear-gradient(135deg,var(--surface-2),var(--surface-1))]">
            <div className="flex h-full items-end p-5">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  <PaperPlaneTilt size={12} weight="bold" />
                  Workspace Invite
                </span>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  Invite your team to {activeWorkspaceName || "this workspace"}
                </h3>
              </div>
            </div>
          </div>
          {inviteLink ? (
            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  Invitation created for {inviteLinkEmail}
                </p>
                <p className="text-xs text-ink-muted">
                  {inviteLinkDelivered
                    ? "We emailed them a link. You can also share it directly."
                    : "The email could not be delivered — share this link instead."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-link" className="text-xs font-medium">
                  Invitation link
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="invite-link"
                    readOnly
                    value={inviteLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="bg-surface-1 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteLink);
                        toast.success("Invitation link copied");
                      } catch {
                        // Clipboard access is refused outside a secure context and in some
                        // embedded browsers. The field is selectable, so say that rather
                        // than leaving a button that silently does nothing.
                        toast.error("Could not copy — select the link and copy it manually");
                      }
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-ink-muted">
                  Single use, and only {inviteLinkEmail} can accept it. This link is shown
                  once — it cannot be retrieved again after you close this dialog.
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetInviteDialog();
                  }}
                >
                  Invite someone else
                </Button>
                <Button
                  type="button"
                  className="text-white"
                  onClick={() => {
                    resetInviteDialog();
                    setIsInviteModalOpen(false);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
          <form onSubmit={handleInviteMember} className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-xs font-medium">
                Email address
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="bg-surface-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role" className="text-xs font-medium">
                Role
              </Label>
              <select
                id="invite-role"
                value={inviteRoleName}
                onChange={(e) => setInviteRoleName(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-surface-1 px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="Member">Member</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviteMemberMutation.isPending || !inviteEmail.trim()}
                className="text-white"
              >
                {inviteMemberMutation.isPending ? "Sending..." : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
