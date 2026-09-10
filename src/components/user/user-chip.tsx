"use client";

import type { ReactNode } from "react";

import {
  PRESENCE_DOT_CLASSES,
  PRESENCE_LABELS,
} from "@/components/presence/presence-appearance";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMemberPresence } from "@/hooks/use-presence";
import { getLanguageName } from "@/lib/language/languages";
import { cn } from "@/lib/utils";
import { usePresenceStore } from "@/stores/presence-store";

/**
 * A person's name, wherever the product prints one.
 *
 * WHY THIS EXISTS
 *   A name rendered as bare text is a dead end. "wrj · Ngô Xuân Hạnh Nhi" under a meeting title
 *   told you who hosted it and gave you no way to find out who that is — not their email, not
 *   their role in the workspace, not whether they are at their desk right now. Every list in the
 *   app had its own spelling of the same dead end: a `<span>` in the history rows, a pill in the
 *   rooms list, `Hosted by {meeting.hostName}` on the schedule, `— {item.ownerName}` beside an
 *   action item.
 *
 *   The room detail page already had the answer — a `UserChip` with a popover carrying the face,
 *   the email, the role and the languages — but it was a private function inside a 2,100-line
 *   page file, so no other surface could reach it. This is that component lifted out, with
 *   presence added, and it is now the only way a person's name reaches the screen.
 *
 * PRESENCE IS FETCHED ON OPEN, NOT ON RENDER
 *   `useMemberPresence` resolves one id per hook instance and its "already requested" guard is
 *   per-instance, so a chip that subscribed on render would fire one request per row — fifty
 *   lookups to draw a list nobody has clicked yet. The trigger therefore only READS the presence
 *   store (populated in bulk by the pages that already call `usePresence`, and kept current by
 *   the notification hub), and the popover — which mounts on open — is what actually resolves it.
 *   So a list costs nothing and a click costs one lookup.
 *
 * NOT A NATIVE BUTTON
 *   Most of these names sit inside something already clickable: a row that is a `<Link>`, a card
 *   that opens a meeting. A `<button>` nested in an `<a>` is invalid HTML, so the trigger renders
 *   a span and Base UI supplies the button role and keyboard handling — the same arrangement the
 *   sidebar's account card uses. The wrapper swallows the click so opening the chip never also
 *   navigates the row underneath it.
 */
export type UserChipIdentity = {
  /**
   * The user's id — what presence is keyed on. Absent for someone who exists only as an invited
   * email address, or as a speaker label on a transcript; the chip still renders, it just has no
   * presence to show.
   */
  userId?: string | null;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  /** Their standing where this name appears: "Owner", "Organizer", "Member", "Invitee". */
  role?: string | null;
  /**
   * A status the caller already knows, which is NOT presence: "Waiting", "Left", "pending". Both
   * are shown when both exist, because "invited but has not accepted" and "online" are different
   * facts about the same person.
   */
  status?: string | null;
  speakLanguage?: string | null;
  listenLanguage?: string | null;
};

type ChipSize = "sm" | "md";

/** The face, with a presence dot when presence is already known. */
export function UserChipAvatar({
  user,
  className,
  showPresence = true,
}: {
  user: UserChipIdentity;
  className?: string;
  showPresence?: boolean;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className="size-full bg-primary/10" title={user.name}>
        {/* No <AvatarImage> at all without a URL: Base UI keeps the fallback mounted until an
            image resolves, and an <img src=""> resolves against the page URL and logs a failed
            request on every render. */}
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-transparent font-semibold uppercase text-primary">
          {user.name?.charAt(0) || "U"}
        </AvatarFallback>
      </Avatar>
      {showPresence ? <StoredPresenceDot userId={user.userId} /> : null}
    </span>
  );
}

/**
 * The presence dot for a face, read from the store and never fetched.
 *
 * An unresolved id renders nothing at all — drawing it grey would assert "offline" about someone
 * we have not asked about yet, which is the one wrong answer available here.
 */
function StoredPresenceDot({ userId }: { userId?: string | null }) {
  const state = usePresenceStore((store) =>
    userId ? store.states[userId] : undefined,
  );
  if (!state) return null;

  return (
    <span
      role="img"
      aria-label={PRESENCE_LABELS[state]}
      title={PRESENCE_LABELS[state]}
      className={cn(
        "absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-2 ring-surface-1",
        PRESENCE_DOT_CLASSES[state],
      )}
    />
  );
}

export function UserChip({
  user,
  size = "md",
  variant = "pill",
  showAvatar = true,
  className,
  align = "start",
}: {
  user: UserChipIdentity;
  size?: ChipSize;
  /**
   * `pill` is the bordered capsule used in lists and property panels. `text` is for the places
   * where a name is part of a sentence or a dense secondary line — "wrj · Nhi", "Hosted by Nhi" —
   * and a capsule would shout over the line it sits in. Both open the same card.
   */
  variant?: "pill" | "text";
  showAvatar?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const avatarSize = size === "sm" ? "size-4 text-[9px]" : "size-5 text-[10px]";

  return (
    <Popover>
      {/* The span, not the trigger, is what stops the click: the event reaches the trigger first
          (it is the inner element), so the popover still opens, and then this keeps it from
          reaching the row's <Link> and navigating away. */}
      <span
        className="contents"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <PopoverTrigger
          nativeButton={false}
          className={cn(
            "inline-flex max-w-full cursor-pointer items-center gap-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            variant === "pill"
              ? cn(
                  "rounded-full border border-border bg-surface-1 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:bg-surface-2",
                  size === "sm"
                    ? "h-6 px-1.5 pr-2 text-[11px]"
                    : "h-7 px-2 pr-2.5 text-[12px]",
                )
              : "rounded-sm underline-offset-2 hover:text-ink hover:underline",
            className,
          )}
          render={<span />}
        >
          {showAvatar ? (
            <UserChipAvatar user={user} className={avatarSize} />
          ) : null}
          <span className="truncate font-medium">{user.name}</span>
        </PopoverTrigger>
      </span>
      <UserChipCard user={user} align={align} />
    </Popover>
  );
}

/**
 * The card behind a chip. Mounted only while the popover is open, which is what keeps presence
 * from being resolved for every row of a list — see the note at the top of this file.
 *
 * Exported because the trigger is not always a chip. The room detail page's roster is a list of
 * full-width ROWS (WT-641 deliberately dropped the capsule there: a row is a bigger hit target
 * than a name, and a capsule reads as a removable token in a "To:" field). That page owns its
 * trigger and reuses this card, which is the whole reason the card is a component and not markup
 * inlined in `UserChip`.
 */
export function UserChipCard({
  user,
  align = "start",
}: {
  user: UserChipIdentity;
  align?: "start" | "center" | "end";
}) {
  const presence = useMemberPresence(user.userId);
  const languages = user.speakLanguage || user.listenLanguage;

  return (
    <PopoverContent
      align={align}
      className="w-[260px] gap-0 rounded-xl border-border/70 p-3 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <UserChipAvatar user={user} className="size-10 text-[14px]" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-ink">
            {user.name}
          </p>
          {/* Only when there is one. The room page's version fell back to `user.id`, which put a
              raw UUID under the name of anyone the page could not match to a workspace member —
              an identifier the reader cannot use, in the slot reserved for one they can. */}
          {user.email ? (
            <p className="truncate text-[12px] text-muted-foreground">
              {user.email}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {user.role ? <UserChipTag>{user.role}</UserChipTag> : null}
            {user.status ? <UserChipTag>{user.status}</UserChipTag> : null}
          </div>
        </div>
      </div>

      {/* Presence is its own line rather than a third tag, because it is the one fact here that
          changes while you are looking at it. Absent until it resolves — see StoredPresenceDot. */}
      {presence ? (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <span
            aria-hidden
            className={cn(
              "block size-2 shrink-0 rounded-full",
              PRESENCE_DOT_CLASSES[presence],
            )}
          />
          <span className="font-medium text-ink">
            {PRESENCE_LABELS[presence]}
          </span>
        </div>
      ) : null}

      {languages ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <div>
            <p>Speaks</p>
            <p className="mt-0.5 font-medium text-ink">
              {user.speakLanguage
                ? getLanguageName(user.speakLanguage)
                : "Not set"}
            </p>
          </div>
          <div>
            <p>Listens</p>
            <p className="mt-0.5 font-medium text-ink">
              {user.listenLanguage
                ? getLanguageName(user.listenLanguage)
                : "Not set"}
            </p>
          </div>
        </div>
      ) : null}
    </PopoverContent>
  );
}

function UserChipTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2 text-[11px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <span className="truncate">{children}</span>
    </span>
  );
}
