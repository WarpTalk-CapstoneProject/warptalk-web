"use client";

/**
 * What the user card at the foot of the sidebar opens.
 *
 * It used to navigate straight to the profile settings page. That made the card a link wearing
 * the shape of a menu: the one thing it could do was the thing nobody clicked it for, and every
 * other account action — workspace settings, billing, signing out — was somewhere else. Sign out
 * was there, but only as an icon that appeared on hover, which is not a place a person looks for
 * the way out.
 *
 * So it is a menu now, and the actions it offers are the ones that belong to "me and this
 * workspace" rather than to a page.
 *
 * THE CREDIT BAR
 *   Owners and admins get the workspace's remaining credits here, because credit is the thing
 *   that stops a meeting mid-sentence and the only place it was visible was the Billing page —
 *   which you had to already suspect a problem to open. It is deliberately NOT shown to members:
 *   they cannot top it up, and a number nobody can act on is only anxiety. Absent rather than
 *   zero when there is no subscription: "0 of 0" reads as an empty wallet, and a workspace with
 *   no plan does not have an empty wallet, it has no wallet.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  GearSix,
  SignOut,
  User as UserIcon,
  UsersThree,
} from "@phosphor-icons/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { billingService } from "@/services/billing.service";
import type { UserDto } from "@/types/auth";

function CreditBar({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: Boolean(workspaceId),
    // Shares the billing page's key on purpose: opening this menu warms that page, and a
    // top-up made there updates here without a second request.
    retry: 1,
  });

  // A workspace with no plan answers this with an error, which is not a fault worth reporting in
  // a menu — there is simply nothing to show yet.
  if (isLoading || isError || !data || data.totalCredits <= 0) return null;

  const remaining = Math.max(0, data.currentCredits);
  const percentage = Math.min(100, Math.round((remaining / data.totalCredits) * 100));
  const isLow = percentage <= 15;

  return (
    <div className="rounded-lg border border-border/60 bg-surface-1 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-ink">Workspace credits</span>
        <span className="text-[12px] tabular-nums text-ink-muted">
          {remaining.toLocaleString()} / {data.totalCredits.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={isLow ? "h-full rounded-full bg-destructive" : "h-full rounded-full bg-primary"}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isLow ? (
        <p className="mt-2 text-[11px] text-destructive">
          Low balance — meetings stop translating when this runs out.
        </p>
      ) : null}
    </div>
  );
}

export function AccountMenuDialog({
  open,
  onOpenChange,
  user,
  workspaceId,
  workspaceSlug,
  role,
  membershipType,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserDto;
  workspaceId: string | null;
  workspaceSlug: string | null;
  role: string | null;
  membershipType: string | null;
  onSignOut: () => void;
}) {
  const normalizedRole = role?.toLowerCase() ?? "";
  const isOwnerOrAdmin = normalizedRole === "owner" || normalizedRole === "admin";
  const base = workspaceSlug ? `/${workspaceSlug}` : null;

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="sr-only">Account</DialogTitle>
          <DialogDescription className="sr-only">
            Your account, this workspace, and the way out.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Avatar className="size-10 rounded-lg border border-border/50">
            <AvatarImage src={user.avatarUrl} alt={user.fullName} />
            <AvatarFallback className="rounded-lg bg-primary/10 text-[15px] font-semibold text-primary">
              {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">{user.fullName}</p>
            <p className="truncate text-[12px] text-ink-muted">{user.email}</p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-primary">
              {role ? `${role.charAt(0).toUpperCase()}${role.slice(1).toLowerCase()}` : "Member"}
              {" · "}
              {membershipType
                ? `${membershipType.charAt(0).toUpperCase()}${membershipType.slice(1).toLowerCase()}`
                : "Internal"}
            </p>
          </div>
        </div>

        {isOwnerOrAdmin && workspaceId ? <CreditBar workspaceId={workspaceId} /> : null}

        <div className="flex flex-col gap-0.5">
          {base ? (
            <>
              <MenuLink
                href={`${base}/settings/account/profile`}
                icon={<UserIcon className="h-4 w-4" />}
                label="Profile settings"
                onNavigate={close}
              />
              <MenuLink
                href={`${base}/members`}
                icon={<UsersThree className="h-4 w-4" />}
                label="Members"
                onNavigate={close}
              />
              {isOwnerOrAdmin ? (
                <>
                  <MenuLink
                    href={`${base}/settings`}
                    icon={<GearSix className="h-4 w-4" />}
                    label="Workspace settings"
                    onNavigate={close}
                  />
                  <MenuLink
                    href={`${base}/billing`}
                    icon={<CreditCard className="h-4 w-4" />}
                    label="Billing"
                    onNavigate={close}
                  />
                </>
              ) : null}
            </>
          ) : null}

          <button
            type="button"
            onClick={() => {
              close();
              onSignOut();
            }}
            className="flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
          >
            <SignOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MenuLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink transition-colors hover:bg-surface-2"
    >
      {icon}
      {label}
    </Link>
  );
}
