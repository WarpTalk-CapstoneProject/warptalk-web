"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SquaresFour,
  Scroll,
  Waveform,
  GearSix,
  MagnifyingGlass,
  CaretDown,
  CaretLeft,
  Plus,
  Keyboard,
  CreditCard,
  Users,
  FileText,
  User,
  Shield,
  Warning,
  House,
  Sliders,
  PaperPlaneTilt,
  Globe,
  EnvelopeSimple,
} from "@phosphor-icons/react/dist/ssr";
import type { IconProps } from "@phosphor-icons/react";
type IconType = React.ElementType<IconProps>;
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useInviteWorkspaceMember, useWorkspaces } from "@/hooks/use-workspace";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSelectWorkspace } from "@/hooks/use-workspace";
import { toast } from "sonner";
import { SignOut } from "@phosphor-icons/react/dist/ssr";

interface NavItem {
  icon: IconType;
  label: string;
  href: string;
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
    pathname === item.href || pathname.startsWith(item.href + "/");
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
      await inviteMemberMutation.mutateAsync({
        email,
        roleName: inviteRoleName,
      });
      toast.success(`Invitation sent to ${email}`);
      setInviteEmail("");
      setInviteRoleName("Member");
      setIsInviteModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send invitation";
      toast.error(message);
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
  workspaceNav.push(
    { icon: Users, label: "Members", href: `/${slug}/members` },
    { icon: FileText, label: "Documents", href: `/${slug}/documents` }
  );

  if (isOwnerOrAdmin) {
    workspaceNav.push({ icon: EnvelopeSimple, label: "Invitations", href: `/${slug}/invitations` });
    workspaceNav.push({ icon: CreditCard, label: "Billing", href: `/${slug}/billing` });
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
          <DropdownMenuContent align="start" className="w-[220px] bg-popover border border-border shadow-md rounded-lg p-1">
            <div className="px-2 py-1.5 text-xs text-ink-muted font-medium">
              Workspaces ({workspaces.length})
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <div className="max-h-[160px] overflow-y-auto">
              {workspaces.map((ws) => {
                const membershipType =
                  "membershipType" in ws && typeof ws.membershipType === "string"
                    ? ws.membershipType
                    : "Internal";

                return (
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => handleSelectWorkspace(ws.id, ws.name, ws.slug, ws.role || "Member", membershipType, ws.defaultLanguage || "en")}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-surface-2",
                      ws.id === activeWorkspaceId ? "bg-surface-2 text-primary font-medium" : "text-ink"
                    )}
                  >
                    <div className="w-[16px] h-[16px] rounded bg-gradient-to-br from-pink-500/80 to-rose-500/80 flex items-center justify-center shrink-0 text-[8px] text-white font-bold">
                      {ws.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="truncate flex-1">{ws.name}</span>
                  </DropdownMenuItem>
                );
              })}
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={() => router.push("/workspace/create")}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-surface-2 text-ink"
            >
              <Plus size={14} className="text-ink-muted" />
              <span>Create Workspace</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={() => logout()}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-surface-2 text-destructive"
            >
              <SignOut size={14} />
              <span>Sign out</span>
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
                item={{ icon: Globe, label: "Global Glossary", href: "/admin/global-glossary" }}
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
            <Avatar className="size-8 rounded-lg border border-border/50">
              <AvatarImage src={user.avatarUrl} alt={user.fullName} />
              <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-[13px] font-semibold">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
              </AvatarFallback>
            </Avatar>
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
                  handleSignOut();
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
        )
      }

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

      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-[520px]">
          <div className="h-36 border-b border-border bg-[radial-gradient(circle_at_28%_18%,rgba(94,106,210,0.30),transparent_34%),radial-gradient(circle_at_78%_22%,rgba(16,185,129,0.18),transparent_30%),linear-gradient(135deg,var(--surface-2),var(--surface-1))]">
            <div className="flex h-full items-end p-5">
              <span className="grid size-12 place-items-center rounded-[14px] border border-white/35 bg-white/40 text-primary shadow-[0_12px_28px_rgba(16,24,40,0.12)] backdrop-blur">
                <PaperPlaneTilt size={24} weight="duotone" />
              </span>
            </div>
          </div>

          <form onSubmit={handleInviteMember} className="grid gap-4 p-5 pt-4">
            <DialogHeader>
              <DialogTitle>Invite team members</DialogTitle>
              <DialogDescription>
                Send an invitation to join {activeWorkspaceName || "this workspace"} and collaborate on rooms, documents, and summaries.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor="invite-email" className="text-[13px] font-medium text-foreground">
                Email address
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoComplete="email"
                className="bg-surface-1"
              />
            </div>

            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="invite-role" className="text-[13px] font-medium text-foreground">
                  Role
                </Label>
                <select
                  id="invite-role"
                  value={inviteRoleName}
                  onChange={(e) => setInviteRoleName(e.target.value)}
                  className="h-9 rounded-[8px] border border-border bg-surface-1 px-3 text-[13px] text-ink outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                >
                  <option value="Member">Member</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

            </div>

            <p className="rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[12px] leading-5 text-ink-muted">
              Internal or External access is assigned automatically from verified email domains.
            </p>

            <DialogFooter className="-mx-5 -mb-5 mt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!inviteEmail.trim() || inviteMemberMutation.isPending}
                className="min-w-[92px] text-white disabled:bg-surface-3 disabled:text-ink-muted disabled:opacity-100"
              >
                {inviteMemberMutation.isPending ? "Inviting..." : "Invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
