"use client";

import { MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export const ADMIN_LIST_SEARCH_DEBOUNCE_MS = 300;

/**
 * The list's search box: debounced into the URL, immediate on Enter, cleared by Escape.
 *
 * The draft is local so typing is never slowed by a router round trip; the URL is still the source
 * of truth, and a back/forward navigation that changes `?q=` behind the box resets the draft during
 * render (not in an effect, which would paint the stale text for a frame).
 */
export function AdminListSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const t = useTranslations("adminLists.toolbar");
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    // Only when the URL disagrees with what is typed: our own debounced write comes back trimmed,
    // and overwriting the draft then would eat the space the admin just typed between two words.
    if (draft.trim() !== value) setDraft(value);
  }

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (draft.trim() === synced) return;
    const timer = window.setTimeout(() => onChangeRef.current(draft), ADMIN_LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, synced]);

  return (
    <div className={cn("relative min-w-0", className)}>
      <MagnifyingGlass
        size={14}
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onChange(draft);
          } else if (event.key === "Escape" && draft) {
            event.preventDefault();
            event.stopPropagation();
            setDraft("");
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder || t("searchAria")}
        className="h-8 w-full rounded-lg border border-hairline bg-surface-1 pl-8 pr-8 text-[13px] text-ink placeholder:text-ink-subtle focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          aria-label={t("clearSearch")}
          className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-ink-subtle hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X size={12} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}
