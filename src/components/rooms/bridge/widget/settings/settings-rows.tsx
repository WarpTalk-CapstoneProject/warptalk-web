"use client";

/**
 * The rows of the widget's settings flyout. WT-525 t4.
 *
 * Drawn to match `SettingsRow` and `SettingsPanelHeader` in meeting-control-bar.tsx — same
 * padding, icon tile, value and chevron — so a user who knows the meeting's settings menu reads
 * this one without learning it again. Copies, not imports: both are module-private there, and that
 * file is not this task's to change. If they are ever exported, these should become re-exports.
 */

import type { ReactNode, Ref } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

export function SettingsPanelHeader({
  title,
  onBack,
  ref,
}: {
  title: string;
  onBack: () => void;
  /** Focused when the panel opens, so a keyboard user lands on the way back. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onBack}
      aria-label={`Back from ${title}`}
      className="mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      <CaretLeft className="h-3.5 w-3.5" />
      {title}
    </button>
  );
}

export function SettingsRow({
  label,
  icon,
  value,
  active,
  hasSubmenu,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  value?: string;
  active?: boolean;
  hasSubmenu?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        active ? "bg-primary/10 text-primary" : "text-ink hover:bg-canvas",
      )}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {value ? <span className="shrink-0 truncate text-[11px] text-ink-muted">{value}</span> : null}
      {hasSubmenu ? <CaretRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" /> : null}
    </button>
  );
}
