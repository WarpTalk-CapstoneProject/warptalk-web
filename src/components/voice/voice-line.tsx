"use client";

/**
 * One voice, as one line.
 *
 * Both lists on the page use it — the profiles somebody recorded and the provider's catalog —
 * because from a reader's side they are the same kind of thing: a voice with a name, a language
 * or a gender, a state, and something you can do to it. Sharing the row is what keeps the play
 * button in the same place in both, which is the whole reason the page scans.
 *
 * WHY THE STATE IS A DOT AND A SENTENCE, NOT A PILL WITH A RAW STATUS IN IT
 *     The list used to print `profile.status` into a badge, so a person read "clone_failed" and
 *     learned nothing they could act on. A colour answers "is this one fine?" at a glance, and
 *     the words beside it say what happened and what to do — on the same line, not in a toast
 *     that has already gone.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type VoiceLineTone = "ready" | "pending" | "failed" | "library";

const TONE_DOT: Record<VoiceLineTone, string> = {
  ready: "bg-emerald-500",
  pending: "bg-amber-500",
  failed: "bg-destructive",
  // Not a state at all: a catalogue voice cannot be half-made, so its marker is furniture and
  // must not read as "fine" next to a profile that genuinely is.
  library: "bg-hairline-strong",
};

export function VoiceLine({
  tone,
  name,
  badge,
  secondary,
  status,
  statusText,
  actions,
}: {
  tone: VoiceLineTone;
  name: string;
  /** "Dubbing you", "You hear this" — what this voice is currently doing for the reader. */
  badge?: ReactNode;
  /** Language for a profile, gender for a catalogue voice. */
  secondary?: ReactNode;
  /** The state, with its chip. Rendered only when the row is wide enough for its own column. */
  status?: ReactNode;
  /** The same state as plain words, for the stacked narrow layout. */
  statusText?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[7px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border px-1.5 py-2.5 last:border-b-0",
        "transition-colors hover:bg-surface-2",
        "@[520px]/main:min-h-[44px] @[520px]/main:grid-cols-[7px_minmax(0,1fr)_112px_minmax(0,190px)_auto] @[520px]/main:py-0",
      )}
    >
      <span aria-hidden className={cn("size-[7px] justify-self-center rounded-full", TONE_DOT[tone])} />

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-medium text-ink">{name}</span>
        {badge}
      </div>

      {/* Own columns once there is room for them; folded into one line below, so a narrow main
          never turns a 44px row into a four-line block. */}
      <span className="hidden truncate text-[12.5px] text-ink-muted @[520px]/main:block">
        {secondary}
      </span>
      <span className="hidden items-center gap-2 truncate text-[12px] text-ink-subtle @[520px]/main:flex">
        {status}
      </span>

      <div className="row-span-2 flex items-center justify-end gap-0.5 @[520px]/main:row-span-1">
        {actions}
      </div>

      <p className="col-start-2 mt-0.5 truncate text-[12px] text-ink-subtle @[520px]/main:hidden">
        {[typeof secondary === "string" ? secondary : undefined, statusText]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

/** The small state chip that sits inside a row or beside a rail module's title. */
export function VoiceChip({
  tone,
  children,
}: {
  tone: "ready" | "pending" | "failed" | "active";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[19px] shrink-0 items-center gap-1 rounded-[5px] px-[7px] text-[10.5px] font-semibold whitespace-nowrap",
        tone === "ready" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        tone === "pending" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        tone === "failed" && "bg-destructive/10 text-destructive",
        tone === "active" && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </span>
  );
}
