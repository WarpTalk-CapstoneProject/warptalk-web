"use client";

import { useEffect, useRef } from "react";

import { PluginGlyph } from "@/components/assistant/plugin-glyph";
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

/** The answers this prompt offers, in the order they are shown. The last one is what Esc takes. */
function buildAnswers(
  prompt: PermissionPrompt,
  handlers: {
    onAnswer: (message: string) => void;
    onConnect: (pluginKey: string) => void;
    onDismiss: () => void;
  },
): { label: string; run: () => void }[] {
  if (prompt.kind === "tool") {
    return (prompt.options ?? [])
      .filter((option) => option.value)
      .map((option) => ({ label: option.label, run: () => handlers.onAnswer(option.value!) }));
  }
  if (prompt.kind === "connect") {
    return [
      {
        label: "Connect",
        run: () => prompt.pluginKey && handlers.onConnect(prompt.pluginKey),
      },
      { label: "Not now", run: handlers.onDismiss },
    ];
  }
  // Nothing to press: an operator has to register the app before anyone can connect it.
  return [{ label: "Dismiss", run: handlers.onDismiss }];
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

export function AssistantPermissionPrompt({
  prompt,
  plugins,
  busy,
  onAnswer,
  onConnect,
  onDismiss,
  className,
}: {
  prompt: PermissionPrompt;
  plugins: AssistantPluginCatalogItemDto[];
  busy?: boolean;
  /** Send the answer as the user's next message. */
  onAnswer: (message: string) => void;
  onConnect: (pluginKey: string) => void;
  onDismiss: () => void;
  className?: string;
}) {
  const plugin = prompt.pluginKey
    ? plugins.find((item) => item.key === prompt.pluginKey)
    : undefined;

  const answers = buildAnswers(prompt, { onAnswer, onConnect, onDismiss });

  // Esc declines, wherever focus is: the prompt sits above the composer, and reaching for the
  // mouse to say no is the wrong amount of work. Enter is the composer's to give — it answers only
  // while nothing is typed, which the parent decides, because this is a write and a stray
  // keystroke must not approve one.
  const declineRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    declineRef.current = answers.length > 0 ? answers[answers.length - 1].run : null;
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

  return (
    <div
      role="group"
      aria-label={`Permission: ${prompt.action}`}
      className={cn(
        "flex flex-col gap-1.5 border-b border-border bg-surface-2 px-3 py-2.5 text-ink",
        className,
      )}
    >
      <div className="flex items-center gap-2">
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
            key={answer.label}
            type="button"
            disabled={busy}
            onClick={answer.run}
            className={cn(
              "rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              index === 0
                ? "border-ink bg-ink text-surface-1 hover:opacity-90"
                : "border-border bg-surface-1 text-ink-muted hover:bg-surface-3 hover:text-ink",
            )}
          >
            {answer.label}
          </button>
        ))}
        {prompt.kind === "tool" ? (
          <span className="ml-auto text-[10.5px] text-ink-subtle">⏎ to allow · Esc to decline</span>
        ) : null}
      </div>
    </div>
  );
}
