"use client";

import { useMemberPresence } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";
import {
  PRESENCE_DOT_CLASSES,
  PRESENCE_LABELS,
} from "@/components/presence/presence-appearance";

const SIZES = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
} as const;

/**
 * The presence indicator for a member, positioned over their avatar by the caller.
 *
 * Renders nothing until presence resolves — an unknown state must not be drawn as offline,
 * which would flash everyone grey on every page load.
 */
export function PresenceDot({
  userId,
  size = "sm",
  className,
}: {
  userId: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const state = useMemberPresence(userId);
  if (!state) return null;

  return (
    <span
      role="img"
      aria-label={PRESENCE_LABELS[state]}
      title={PRESENCE_LABELS[state]}
      className={cn(
        "block shrink-0 rounded-full",
        SIZES[size],
        PRESENCE_DOT_CLASSES[state],
        className,
      )}
    />
  );
}

/**
 * PresenceDot anchored to the bottom-right of an avatar. Expects a `relative` parent.
 */
export function AvatarPresenceDot({
  userId,
  size = "sm",
}: {
  userId: string | null | undefined;
  size?: keyof typeof SIZES;
}) {
  return (
    <PresenceDot
      userId={userId}
      size={size}
      // The ring punches a hole in the avatar so the dot reads as separate from it at any size.
      className="absolute -bottom-0.5 -right-0.5 ring-2 ring-surface-1"
    />
  );
}

/** The same state as a word, for lists that have room for it. */
export function PresenceLabel({ userId }: { userId: string | null | undefined }) {
  const state = useMemberPresence(userId);
  if (!state) return null;

  return (
    <span className="text-[11px] text-ink-subtle">{PRESENCE_LABELS[state]}</span>
  );
}
