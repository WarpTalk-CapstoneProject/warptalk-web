"use client";

/**
 * The detail-page half of both CMS screens: the tab row, the sticky action bar (with Cmd/Ctrl+S
 * for Save draft), the confirmation dialog every destructive or live-affecting action goes
 * through, and the unsaved-changes guard.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Cmd+S / Ctrl+S calls `onSave` instead of the browser's "Save page". Registered once; the
 * latest callback is read through a ref so a re-render never re-binds the listener.
 */
export function useSaveShortcut(onSave: () => void, enabled: boolean) {
  const latest = useRef(onSave);
  useEffect(() => {
    latest.current = onSave;
  }, [onSave]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (enabled) latest.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}

/** Warns before leaving the page with unsaved changes. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/**
 * The selected tab, mirrored into the URL hash (`#preview`) so a reload or a shared link lands on
 * the same tab. A hash, not a search param: it needs no Suspense boundary and no navigation.
 */
export function useHashTab<T extends string>(tabs: readonly T[], fallback: T): [T, (tab: T) => void] {
  const [tab, setTab] = useState<T>(fallback);
  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as T;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the hash after mount
    if (tabs.includes(fromHash)) setTab(fromHash);
    // tabs is a constant per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = useCallback((next: T) => {
    setTab(next);
    try {
      window.history.replaceState(null, "", `#${next}`);
    } catch {
      /* not mirrored */
    }
  }, []);
  return [tab, choose];
}

export function CmsTabBar<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { value: T; label: string; badge?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="hide-scrollbar -mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          id={`tab-${tab.value}`}
          aria-selected={value === tab.value}
          aria-controls={`panel-${tab.value}`}
          onClick={() => onChange(tab.value)}
          className={cn(
            "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[13px] text-ink-muted transition-colors hover:text-ink",
            value === tab.value &&
              "font-medium text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink",
          )}
        >
          {tab.label}
          {tab.badge != null ? (
            <span className="rounded-full bg-surface-2 px-1.5 text-[10.5px] tabular-nums text-ink-muted">{tab.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function CmsTabPanel({ value, active, children }: { value: string; active: string; children: ReactNode }) {
  if (value !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`} className="pt-5">
      {children}
    </div>
  );
}

/**
 * Pinned to the bottom of the viewport on every detail page, so Save and Publish are reachable
 * from the bottom of a long body. `status` is the left-hand summary: dirty state, what is live.
 */
export function CmsActionBar({ status, children }: { status: ReactNode; children: ReactNode }) {
  const t = useTranslations("adminCms.common.editor");
  return (
    <div className="sticky bottom-0 z-30 -mx-5 mt-8 border-t border-border bg-panel/90 px-5 py-3 backdrop-blur lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 text-[12.5px] text-ink-muted">{status}</div>
        <div role="toolbar" aria-label={t("actions")} className="flex flex-wrap items-center gap-2">
          {children}
        </div>
      </div>
    </div>
  );
}

export function DirtyDot({ dirty }: { dirty: boolean }) {
  const t = useTranslations("adminCms.common.editor");
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full", dirty ? "bg-amber-500" : "bg-emerald-500")} aria-hidden />
      {dirty ? t("unsaved") : t("saved")}
      {dirty ? <kbd className="ml-1 rounded border border-border px-1 text-[10.5px] text-ink-subtle">{t("saveShortcut")}</kbd> : null}
    </span>
  );
}

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Extra content: a note field, a locale picker. */
  body?: ReactNode;
  onConfirm: () => Promise<unknown> | void;
}

/**
 * One confirmation dialog per page. The request is captured when it opens, so a field inside
 * `body` (a publish note, a target locale) must be uncontrolled and read through a ref in
 * `onConfirm` — a state value would be the one from the moment the dialog opened. Stays open while
 * the action runs so a double click cannot fire it twice, and closes when it finishes.
 */
export function useConfirm(): [(request: ConfirmRequest) => void, ReactNode] {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useTranslations("adminCms.common.editor");

  const dialog = (
    <Dialog open={Boolean(request)} onOpenChange={(open) => (!open && !busy ? setRequest(null) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        {request?.body}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setRequest(null)}>
            {t("cancel")}
          </Button>
          <Button
            variant={request?.destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              if (!request) return;
              setBusy(true);
              try {
                await request.onConfirm();
              } finally {
                setBusy(false);
                setRequest(null);
              }
            }}
          >
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [setRequest, dialog];
}
