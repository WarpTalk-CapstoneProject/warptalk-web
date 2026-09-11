"use client";

/**
 * The layout of the Meet widget. WT-525, Phase 2.
 *
 *   ┌ header ───────────────────────────────────────────────┐
 *   │ ● Translating  [Transcript paused]        [End · t3]  │
 *   ├ Transcript | WarpBot ─────────────────────────────────┤
 *   │                                                        │
 *   │   TranscriptPane (t2)   or   WarpBotPane (t5)          │
 *   │                                                        │
 *   ├ dock ─────────────────────────────────────────────────┤
 *   │ [session t3] │ [language t4]            [settings t4] │
 *   └────────────────────────────────────────────────────────┘
 *
 *   Once `ended`, EndedView (t3) replaces the tabs and the dock; the header stays.
 *
 * The shell passes its slots NO props — see widget-context.tsx. Adding something a slot needs is
 * a change to the context, never to this file.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   - Mic, camera, chat, leave. Google Meet owns the call, including in its own PiP window.
 *   - A participant chat tab. Exactly two tabs: Transcript and WarpBot.
 *   - A Leave button. In a bridge room the stand-in never disconnects, so leaving would orphan the
 *     room; End (t3) is the one exit.
 *   - Colours. Theme tokens only: this window floats among the user's own, and the hardcoded
 *     black background WT-577 removed is the complaint that rule exists for.
 */

import { useId, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { DockLanguagePill } from "./dock-language-pill";
import { DockSessionControls } from "./dock-session-controls";
import { EndSessionButton } from "./end-session";
import { EndedView } from "./ended-view";
import { SettingsFlyout } from "./settings-flyout";
import { TranscriptPane } from "./transcript-pane";
import { WarpBotPane } from "./warpbot-pane";
import {
  useBridgeWidget,
  type BridgeWidgetConnectionState,
  type BridgeWidgetTranslationStatus,
} from "./widget-context";

type WidgetTab = "transcript" | "warpbot";

const TABS: ReadonlyArray<{ id: WidgetTab; label: string }> = [
  { id: "transcript", label: "Transcript" },
  { id: "warpbot", label: "WarpBot" },
];

export function WidgetShell() {
  const { ended } = useBridgeWidget();

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-canvas text-ink">
      <WidgetHeader />
      {ended ? (
        <EndedView />
      ) : (
        <>
          <WidgetTabs />
          <WidgetDock />
        </>
      )}
    </main>
  );
}

// ── header ───────────────────────────────────────────────────────────────────

const STATUS: Record<BridgeWidgetTranslationStatus, { label: string; dot: string } | null> = {
  // Nothing until the sessions query answers — see BridgeWidgetTranslationStatus.
  unknown: null,
  ready: { label: "Ready", dot: "bg-primary" },
  translating: { label: "Translating", dot: "bg-semantic-success" },
  stopped: { label: "Translation stopped", dot: "bg-ink-subtle" },
};

/**
 * Said only when something is wrong. "Live" in the header of a window that is working is noise;
 * the hub here only carries this user's language and voice changes (see
 * use-bridge-widget-state.ts), so a dropped connection matters exactly when somebody tries one.
 */
const CONNECTION_NOTE: Partial<Record<BridgeWidgetConnectionState, string>> = {
  reconnecting: "Reconnecting…",
  failed: "Disconnected",
};

function WidgetHeader() {
  const { translationStatus, transcriptPaused, connectionState, ended } = useBridgeWidget();
  const status = STATUS[translationStatus];
  const connectionNote = CONNECTION_NOTE[connectionState];

  return (
    <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border bg-surface-1 px-3.5 py-2">
      {status ? (
        <>
          <span className={cn("size-2 shrink-0 rounded-full", status.dot)} aria-hidden="true" />
          <span className="truncate text-[13px] font-semibold">{status.label}</span>
        </>
      ) : (
        <span className="size-2 shrink-0 rounded-full bg-surface-3" aria-hidden="true" />
      )}

      {transcriptPaused && !ended ? (
        // Text in ink, amber on the wash only: the amber token is too light to carry 10px text
        // on a light surface by itself.
        <span className="shrink-0 rounded border border-status-waiting/50 bg-status-waiting/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
          Transcript paused
        </span>
      ) : null}

      {connectionNote ? (
        <span className="shrink-0 text-[11px] text-ink-subtle" role="status">
          {connectionNote}
        </span>
      ) : null}

      {/* Header actions slot (t3). Right-aligned; gone once the session has ended. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5" data-slot="bridge-widget-header-actions">
        {ended ? null : <EndSessionButton />}
      </div>
    </header>
  );
}

// ── tabs ─────────────────────────────────────────────────────────────────────

function WidgetTabs() {
  const [tab, setTab] = useState<WidgetTab>("transcript");
  const baseId = useId();
  const tabRefs = useRef<Record<WidgetTab, HTMLButtonElement | null>>({
    transcript: null,
    warpbot: null,
  });

  /** WAI-ARIA tabs: arrows move between tabs and select, Home/End jump to the ends. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((entry) => entry.id === tab);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = TABS[next].id;
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="WarpTalk"
        onKeyDown={onKeyDown}
        className="flex shrink-0 gap-0.5 border-b border-border bg-surface-1 px-3"
      >
        {TABS.map((entry) => {
          const selected = entry.id === tab;
          return (
            <button
              key={entry.id}
              ref={(element) => {
                tabRefs.current[entry.id] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${entry.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${entry.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(entry.id)}
              className={cn(
                "-mb-px border-b-2 px-2.5 pb-[7px] pt-2 text-xs font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                selected
                  ? "border-primary text-ink"
                  : "border-transparent text-ink-subtle hover:text-ink",
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {/* Both panes stay mounted and the inactive one is `hidden`: switching tabs must not throw
          away the transcript's scroll position or a half-typed WarpBot question. */}
      {TABS.map((entry) => (
        <div
          key={entry.id}
          role="tabpanel"
          id={`${baseId}-panel-${entry.id}`}
          aria-labelledby={`${baseId}-tab-${entry.id}`}
          hidden={entry.id !== tab}
          // `flex` only on the visible one: a display utility on the element would otherwise
          // compete with the `hidden` attribute for whether the pane shows at all.
          className={cn("relative min-h-0 flex-1 flex-col", entry.id === tab ? "flex" : "hidden")}
        >
          {entry.id === "transcript" ? <TranscriptPane /> : <WarpBotPane />}
        </div>
      ))}
    </>
  );
}

// ── dock ─────────────────────────────────────────────────────────────────────

/**
 * One row: session controls │ language pill ··· settings.
 *
 * `relative` so the slots' flyouts can open upward from it (`bottom-full`). The left group may
 * shrink — the language pill is the one flexible item — and the right group never does, so the
 * settings button cannot be pushed out of a 320px-wide window.
 */
function WidgetDock() {
  return (
    <section
      aria-label="WarpTalk controls"
      data-slot="bridge-widget-dock"
      className="relative flex shrink-0 items-center gap-1.5 border-t border-border bg-surface-2 px-3 py-2.5"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <DockSessionControls />
        <span aria-hidden="true" className="mx-0.5 h-[22px] w-px shrink-0 bg-border" />
        <DockLanguagePill />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SettingsFlyout />
      </div>
    </section>
  );
}
