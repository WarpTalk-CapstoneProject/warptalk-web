"use client";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

import { useUIStore } from "@/stores/ui-store";

/**
 * The search box in the header.
 *
 * It is only a trigger. The palette it opens — `SearchMeetingDialog` — already existed, is
 * already mounted by the app layout, and already owns Ctrl/Cmd-K; what had gone missing was
 * any visible way into it other than a magnifier icon, because the Topbar that used to hold
 * the input was never rendered by a layout.
 *
 * Deliberately not a second palette. An earlier pass here built one, which meant two ⌘K
 * handlers firing on the same keypress and two different sets of results for the same query.
 * Anything the search should be able to do belongs in the dialog, not in a rival copy of it.
 */
export function HeaderSearch() {
  const setSearchMeetingModalOpen = useUIStore((state) => state.setSearchMeetingModalOpen);

  return (
    <button
      type="button"
      onClick={() => setSearchMeetingModalOpen(true)}
      aria-label="Search, or enter a room code"
      className="hidden h-7 w-full max-w-[420px] items-center gap-2 rounded-md border border-border bg-surface-1 px-2.5 text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink md:flex"
    >
      <MagnifyingGlass weight="light" className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate text-left">Search, or paste a room code</span>
      <kbd className="rounded-sm bg-surface-2 px-1.5 font-mono text-[10px] text-ink-muted">⌘K</kbd>
    </button>
  );
}
