"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { LumidotSpinner } from "@/components/ui/lumidot-spinner";
import { cn } from "@/lib/utils";
import type { AssistantPluginCatalogItemDto } from "@/types/assistant";

/**
 * Everything WarpBot has to ask before it may act, in one form above the composer.
 *
 * WHY ONE FORM
 *   There were three: a confirmation card with rows built from the tool call's own arguments, a
 *   second card for a plugin that needed connecting, and a third for a provider only an operator
 *   can register. One question — "may I?" — asked in three shapes, and the rows described the
 *   server's defaults as if somebody had chosen them ("Title: Google Meet meeting"). The form
 *   names the action and offers the answers; what was actually created is in the reply.
 *
 * WHY ABOVE THE COMPOSER
 *   A card in the thread scrolls away behind the answer that follows it, and it is gone when the
 *   conversation is reopened — WarpBot then talks about a card nobody can see. Here it sits where
 *   the user's hands already are, and it is plainly a thing to act on rather than a message.
 *
 * WHY IT STAYS AFTER THE PRESS
 *   The form used to vanish on the press. Creating a Google Meet meeting takes seconds, so what
 *   the user got for saying yes was an empty composer and no way to tell whether a write had
 *   started, finished, or been dropped on the floor — the same press twice was the obvious guess.
 *   So the press does not end the form, it moves it: `running` while the turn is open, then one
 *   line saying the turn is over, which leaves on its own. The reply in the thread remains the
 *   account of WHAT happened; this only tracks the question it answered.
 *
 *   The turn's end is not something this component can see, so the surface stamps `turnEndedAt`
 *   from the hub event it already receives. The prompt outlives its own answer, which is why
 *   clearing the slot moved out of the answer handler and into `onDismiss` here.
 *
 * WHY THE BUTTONS SAY LESS THAN THE WORKER DOES
 *   The worker's labels are sentences ("No, and tell WarpBot what to do differently") and wrapped
 *   to a second row in a 460px composer, pushing the keyboard hint out of the way. The buttons
 *   carry the short word and the sentence moves to `title`/`aria-label`. The MESSAGE each answer
 *   sends is untouched — it is the worker's own `value`, which the model parses.
 *
 * KEYBOARD
 *   Enter takes the first answer while the composer is empty; Esc takes the last one. Typing
 *   anything makes Enter send that message instead, because a half-written question is a better
 *   answer than a button press the user did not mean.
 */

export type PermissionPromptKind = "tool" | "connect" | "blocked";

export type PermissionOption = {
  label: string;
  /** The message this answer sends. Absent for answers the client handles itself. */
  value?: string;
};

export type PermissionPrompt = {
  kind: PermissionPromptKind;
  /** What is being asked about: a tool's label, or a plugin's name. */
  action: string;
  toolName?: string;
  pluginKey?: string;
  connectionStatus?: string;
  connectedAccountEmail?: string | null;
  message?: string | null;
  options?: PermissionOption[];
};

/** Read the prompt off an AssistantQuestion payload, or null when there is none. */
export function parsePermissionPrompt(json: string): PermissionPrompt | null {
  try {
    const parsed = JSON.parse(json) as { permission?: unknown };
    const raw = parsed?.permission;
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as Record<string, unknown>;

    const kind = candidate.kind;
    const action = candidate.action;
    if (kind !== "tool" && kind !== "connect" && kind !== "blocked") return null;
    if (typeof action !== "string" || !action.trim()) return null;

    const options = Array.isArray(candidate.options)
      ? candidate.options.flatMap((option) => {
          if (!option || typeof option !== "object") return [];
          const { label, value } = option as Record<string, unknown>;
          if (typeof label !== "string" || !label.trim()) return [];
          return [
            {
              label: label.trim(),
              value: typeof value === "string" ? value : undefined,
            },
          ];
        })
      : [];

    return {
      kind,
      action: action.trim(),
      toolName: typeof candidate.toolName === "string" ? candidate.toolName : undefined,
      pluginKey: typeof candidate.pluginKey === "string" ? candidate.pluginKey : undefined,
      connectionStatus:
        typeof candidate.connectionStatus === "string" ? candidate.connectionStatus : undefined,
      connectedAccountEmail:
        typeof candidate.connectedAccountEmail === "string" ? candidate.connectedAccountEmail : null,
      message: typeof candidate.message === "string" ? candidate.message : null,
      options,
    };
  } catch {
    return null;
  }
}

/** What answering does — not what the worker called it. */
type AnswerRole = "allow-once" | "always-allow" | "decline";

/**
 * The short word on the button, and the sentence it stands for.
 *
 * The sentence is the accessible name as well as the tooltip: a button reading "No" beside a
 * write is exactly the case where a screen reader user needs the rest of it, and `title` alone
 * is announced by nothing reliably.
 */
const SHORT_ANSWERS: Record<AnswerRole, { label: string; meaning: string }> = {
  "allow-once": { label: "Yes", meaning: "Run this action once" },
  "always-allow": {
    label: "Always allow",
    meaning: "Run it now and stop asking for this tool",
  },
  decline: {
    label: "No",
    meaning: "Don't run it — tell WarpBot what to do instead",
  },
};

/** Said once the turn that ran the write is over, when the answer also changed the tool's policy. */
const ALWAYS_ALLOW_RECEIPT = "WarpBot won't ask again for this action.";

/** How long the receipt stays before it takes itself off the screen. */
const RECEIPT_VISIBLE_MS = 4000;

/**
 * Which of the three answers this is — read off the MACHINE line, not the wording.
 *
 * The message an answer sends is a contract with the model ("Confirm the <tool> plugin action.
 * confirmationToken: …", `alwaysAllow: true`, "Do not run …"), so it is the part that cannot be
 * reworded without the worker and the model being changed together. Position is not used: the
 * worker decides how many answers to offer, and "the last one" has meant Cancel and Always allow
 * in different versions of it.
 *
 * Null when neither the machine line nor the label can be placed — the caller then shows the
 * worker's own label, which is long but never wrong.
 */
function answerRole(option: PermissionOption): AnswerRole | null {
  const value = option.value ?? "";
  if (/\bDo not run\b/i.test(value)) return "decline";
  if (/alwaysAllow\s*:\s*true/i.test(value)) return "always-allow";
  if (/\bConfirm the\b/i.test(value)) return "allow-once";

  // The worker's wording has shifted before; these are its current labels, and the order matters
  // because both long ones begin with a word the short ones also begin with.
  const label = option.label.toLowerCase();
  if (label.startsWith("no")) return "decline";
  if (label.startsWith("always") || label.includes("ask again")) return "always-allow";
  if (label.startsWith("yes")) return "allow-once";
  return null;
}

type PromptAnswer = {
  /** Stable across the worker's wording, so React does not remount a button on a relabel. */
  key: string;
  label: string;
  /** The long form, for `title` and `aria-label`. Absent where the button already says it all. */
  meaning?: string;
  /** Answers that send a message put the form into `running`; Connect and Not now do not. */
  sends: boolean;
  role: AnswerRole | null;
  run: () => void;
};

/** The answers this prompt offers, in the order they are shown. The last one is what Esc takes. */
function buildAnswers(
  prompt: PermissionPrompt,
  handlers: {
    onAnswer: (message: string) => void;
    onConnect: (pluginKey: string) => void;
    onDismiss: () => void;
  },
): PromptAnswer[] {
  if (prompt.kind === "tool") {
    return (prompt.options ?? [])
      .filter((option) => option.value)
      .map((option) => {
        const role = answerRole(option);
        const short = role ? SHORT_ANSWERS[role] : null;
        return {
          key: role ?? option.label,
          label: short?.label ?? option.label,
          meaning: short?.meaning,
          sends: true,
          role,
          run: () => handlers.onAnswer(option.value!),
        };
      });
  }
  if (prompt.kind === "connect") {
    return [
      {
        key: "connect",
        label: "Connect",
        sends: false,
        role: null,
        run: () => prompt.pluginKey && handlers.onConnect(prompt.pluginKey),
      },
      { key: "not-now", label: "Not now", sends: false, role: null, run: handlers.onDismiss },
    ];
  }
  // Nothing to press: an operator has to register the app before anyone can connect it.
  return [{ key: "dismiss", label: "Dismiss", sends: false, role: null, run: handlers.onDismiss }];
}

/** The line under the action: what answering does, in the app's own words. */
function questionFor(prompt: PermissionPrompt): string {
  if (prompt.kind === "connect") {
    return prompt.connectionStatus === "expired" || prompt.connectionStatus === "revoked"
      ? "Sign in again to let WarpBot use it?"
      : "Connect this app to let WarpBot use it?";
  }
  if (prompt.kind === "blocked") {
    return prompt.message ?? "An administrator has to register this app before it can be used.";
  }
  return "Do you want to proceed?";
}

/**
 * Which ask this is, from its own contents.
 *
 * Not the object's identity: the meeting panel re-parses the payload out of the store, so the
 * object is new on every render and an answer would be forgotten between two of them. The
 * confirmation token is part of the message each answer sends, so two genuine asks for the same
 * tool differ here.
 */
function identify(prompt: PermissionPrompt): string {
  return [
    prompt.kind,
    prompt.action,
    prompt.toolName ?? "",
    prompt.pluginKey ?? "",
    ...(prompt.options ?? []).map((option) => option.value ?? option.label),
  ].join("\u0000");
}

export function AssistantPermissionPrompt({
  prompt,
  plugins,
  busy,
  answered,
  turnEndedAt,
  onAnswer,
  onConnect,
  onDismiss,
  className,
}: {
  prompt: PermissionPrompt;
  plugins: AssistantPluginCatalogItemDto[];
  busy?: boolean;
  /**
   * An answer this surface sent on the user's behalf, which this form cannot see: Enter on an empty
   * composer, which takes the first answer. Always the run-once answer, so it never carries the
   * always-allow line. A press on one of the buttons here is known directly and wins.
   */
  answered?: boolean;
  /**
   * When the last turn ended, from the surface's own hub events, and null while one is open. A send
   * clears it, so after an answer this is null until the turn that answer opened is over — which is
   * the moment the form stops saying "Running…".
   */
  turnEndedAt?: number | null;
  /** Send the answer as the user's next message. The prompt stays: it has a state to show now. */
  onAnswer: (message: string) => void;
  onConnect: (pluginKey: string) => void;
  /** Take the form off the screen — a decline, or the receipt's four seconds running out. */
  onDismiss: () => void;
  className?: string;
}) {
  const plugin = prompt.pluginKey
    ? plugins.find((item) => item.key === prompt.pluginKey)
    : undefined;

  const answers = buildAnswers(prompt, { onAnswer, onConnect, onDismiss });

  // The press this form is showing the state of. Held against the ask's identity rather than
  // cleared by an effect: a new ask arriving replaces what is on screen in the same render, with
  // no frame in which the previous answer's spinner sits under the new question.
  const [pressed, setPressed] = useState<{ id: string; alwaysAllow: boolean } | null>(null);
  const promptId = identify(prompt);
  const pressedHere = pressed?.id === promptId ? pressed : null;
  // No clock: the surface nulls `turnEndedAt` as the answer goes out, so "a turn is open" is the
  // question being asked, and neither side has to reason about which stamp belongs to which turn.
  const phase: "asking" | "running" | "done" = !(pressedHere || answered)
    ? "asking"
    : turnEndedAt != null
      ? "done"
      : "running";

  function press(answer: PromptAnswer) {
    if (answer.sends) {
      setPressed({ id: promptId, alwaysAllow: answer.role === "always-allow" });
    }
    answer.run();
  }

  // Esc declines, wherever focus is: the prompt sits above the composer, and reaching for the
  // mouse to say no is the wrong amount of work. Enter is the composer's to give — it answers only
  // while nothing is typed, which the parent decides, because this is a write and a stray
  // keystroke must not approve one. Neither applies once an answer is on its way: there is nothing
  // left to decline, and Esc then has to fall through to whatever else is listening.
  const declineRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    declineRef.current =
      phase === "asking" && answers.length > 0
        ? () => press(answers[answers.length - 1])
        : null;
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || !declineRef.current) return;
      event.preventDefault();
      declineRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The receipt takes itself off the screen. Through a ref so the countdown is not restarted by
  // the parent re-rendering with a fresh closure — which, in the widget, is every keystroke.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  useEffect(() => {
    if (phase !== "done") return;
    const timer = window.setTimeout(() => dismissRef.current(), RECEIPT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase !== "asking") {
    const running = phase === "running";
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex flex-col gap-1 border-b border-border px-3 py-2.5",
          // Flat, and without the answers' ground: there is nothing to act on any more, and the
          // raised panel kept drawing the eye to a form that had stopped asking anything.
          running ? "bg-surface-1 text-ink" : "bg-success/10 text-ink",
          className,
        )}
      >
        <div className="flex items-center gap-2">
          {running ? (
            <LumidotSpinner />
          ) : (
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              <Check size={13} strokeWidth={3} className="text-success" />
            </span>
          )}
          <span
            className={cn(
              "text-[12.5px] font-medium",
              running ? "text-ink" : "text-success",
            )}
          >
            {running ? "Running…" : "Done"}
          </span>
        </div>
        {/* What it was about, demoted: while the write runs it is context, not the question. */}
        {running ? (
          <p className="truncate text-[12px] leading-snug text-ink-muted">{prompt.action}</p>
        ) : pressedHere?.alwaysAllow ? (
          <p className="text-[12px] leading-snug text-ink-muted">{ALWAYS_ALLOW_RECEIPT}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={`Permission: ${prompt.action}`}
      // @container, not a viewport breakpoint: what decides whether this fits is the composer it
      // sits in — 460px in the widget, narrower in a meeting's side panel — and the window's width
      // says nothing about either.
      className={cn(
        "@container flex flex-col gap-1.5 border-b border-border bg-surface-2 px-3 py-2.5 text-ink",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {plugin ? (
          <PluginGlyph
            plugin={plugin}
            size="xs"
            className="size-4 rounded-[4px] border-0 text-[7px] shadow-none"
          />
        ) : null}
        <span className="truncate font-mono text-[12.5px] font-medium">{prompt.action}</span>
      </div>
      <p className="text-[12px] leading-snug text-ink-muted">{questionFor(prompt)}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        {answers.map((answer, index) => (
          <button
            key={answer.key}
            type="button"
            disabled={busy}
            title={answer.meaning}
            aria-label={answer.meaning}
            onClick={() => press(answer)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
              index === 0
                ? "border-ink bg-ink text-surface-1 hover:opacity-90"
                : "border-border bg-surface-1 text-ink-muted hover:bg-surface-3 hover:text-ink",
            )}
          >
            {answer.label}
          </button>
        ))}
        {/* The hint goes before the answers do. In a narrow composer it is what pushed the buttons
            onto a second row, and it describes keys somebody reaching for the mouse is not using. */}
        {prompt.kind === "tool" ? (
          <span className="ml-auto text-[10.5px] text-ink-subtle @max-[360px]:hidden">
            ⏎ to allow · Esc to decline
          </span>
        ) : null}
      </div>
    </div>
  );
}
