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
 * WHY IT IS A DROPDOWN AND NOT A DIALOG
 *   It was a centred modal with a dimmed backdrop, which is the weight you spend on a decision:
 *   confirm this, discard that. This is a menu. It answers "where do I go from here", and the
 *   answer is usually "nowhere, I was just checking my credits". A modal makes that cost a
 *   blackout of the page behind it and a deliberate dismissal. Anchored to the card it opened
 *   from, with the workspace still visible behind it, it costs a glance.
 *
 * THE CREDIT BAR
 *   Owners and admins get the workspace's remaining credits here, because credit is the thing
 *   that stops a meeting mid-sentence and the only other place it was visible was the Billing
 *   page — which you had to already suspect a problem to open. It is deliberately NOT shown to
 *   members: they cannot top it up, and a number nobody can act on is only anxiety.
 */

import type { ReactElement } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getErrorStatus } from "@/lib/api/retry-policy";
import { billingService } from "@/services/billing.service";
import type { UserDto } from "@/types/auth";

function CreditBar({ workspaceId }: { workspaceId: string }) {
  // `status`, not `isLoading`. isLoading is `isPending && isFetching`, so it is FALSE in the
  // gap between a failed attempt and its retry — and in that gap isError is false too and data
  // is undefined, so every guard fell through and the bar rendered as nothing. That window is
  // seconds wide on a slow or failing credits call, which is exactly when an owner is looking
  // for it. status has one value at a time and no such gap.
  const { data, status, error } = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: Boolean(workspaceId),
    retry: 1,
  });

  if (status === "pending") {
    return (
      <div className="rounded-lg border border-border/60 bg-surface-1 p-3">
        <div className="h-3 w-24 animate-pulse rounded bg-surface-3" />
        <div className="mt-2 h-1.5 w-full animate-pulse rounded-full bg-surface-3" />
      </div>
    );
  }

  // A workspace with no subscription is not a failure, and must not read as one.
  //
  // The endpoint answers 404 for it (BillingSubscriptionNotFound). It used to answer 400 for
  // everything, which is why the dashboard showed "Couldn't load workspace credits." to an
  // owner whose workspace simply has no plan — a scary sentence about a perfectly ordinary
  // state. Backend fix: CreditsController.ToActionResult.
  //
  // 403 is the same kind of non-event from this component's point of view: a member who cannot
  // see billing gets no bar, not an error about one.
  const errorStatus = status === "error" ? getErrorStatus(error) : null;
  if (errorStatus === 404 || errorStatus === 403) return null;

  // Anything else IS said rather than swallowed. Returning null on every failure is the same
  // thing on screen as "no plan", and a broken bar that looks identical to an absent one is a
  // bar nobody can report.
  if (status === "error") {
    return (
      <div className="rounded-lg border border-border/60 bg-surface-1 px-3 py-2">
        <p className="text-[11px] text-ink-subtle">Couldn&rsquo;t load workspace credits.</p>
      </div>
    );
  }

  // No plan is not an empty wallet, it is no wallet. "0 of 0" would claim the first.
  if (!data || data.totalCredits <= 0) return null;

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

export function AccountMenu({
  open,
  onOpenChange,
  trigger,
  user,
  workspaceId,
  workspaceSlug,
  role,
  membershipType,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element the menu hangs off — the sidebar's user card. */
  trigger: ReactElement;
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
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* nativeButton={false} because the trigger is the sidebar's user CARD, a div that
          already contains its own hover sign-out button. Rendering it as a native <button>
          would nest a button inside a button, which is invalid; Base UI logs an error for
          exactly this and applies the button role and keyboard handling itself instead. */}
      <PopoverTrigger nativeButton={false} render={trigger} />
      {/* Above the card it belongs to, left edges aligned — the direction a menu at the bottom
          of a sidebar has room to open. */}
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[280px] gap-2 p-2"
      >
        <div className="flex items-center gap-2.5 px-1 pt-0.5">
          <Avatar className="size-9 rounded-lg border border-border/50">
            <AvatarImage src={user.avatarUrl} alt={user.fullName} />
            <AvatarFallback className="rounded-lg bg-primary/10 text-[14px] font-semibold text-primary">
              {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">{user.fullName}</p>
            <p className="truncate text-[11px] text-ink-muted">{user.email}</p>
            <p className="mt-0.5 truncate text-[10px] font-medium text-primary">
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
                    href={`${base}/settings/billing`}
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
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
          >
            <SignOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
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
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-2"
    >
      {icon}
      {label}
    </Link>
  );
}
