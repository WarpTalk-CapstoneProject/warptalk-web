"use client";

/**
 * WarpBot's permission form, in every state, without a plugin write to trigger one.
 *
 * WHY THIS EXISTS
 *   The form only appears behind a signed-in session, a connected plugin and a model that has
 *   decided to call a write tool — and two of its three states last a few seconds each. Every
 *   earlier change to it was checked by asking somebody to go and create a Google Meet meeting,
 *   which is how a spinner nobody ever saw, and a receipt that never went away, would survive.
 *
 *   Same purpose as the other dev/* previews: not a test, a place to SEE it. The bottom row is the
 *   real thing end to end — press an answer and the states run on their own, driven exactly as a
 *   surface drives them (`answered`, then `turnEndedAt`).
 */

import { useState } from "react";

import {
  AssistantPermissionPrompt,
  type PermissionPrompt,
} from "@/components/assistant/permission-prompt";
import type { AssistantPluginCatalogItemDto } from "@/types/assistant";

/** The worker's own answers, machine lines included: the short labels are derived from these. */
const TOOL_PROMPT: PermissionPrompt = {
  kind: "tool",
  action: "Create Google Meet meeting",
  toolName: "google_meet_create_event",
  pluginKey: "google_meet",
  options: [
    {
      label: "Yes",
      value:
        "Yes\n\nConfirm the google_meet_create_event plugin action. confirmationToken: CfDJ8preview",
    },
    {
      label: "Yes, and don't ask again for this tool",
      value:
        "Yes, and don't ask again for this tool\n\nConfirm the google_meet_create_event plugin"
        + " action. confirmationToken: CfDJ8preview. alwaysAllow: true",
    },
    {
      label: "No, and tell WarpBot what to do differently",
      value: "No\n\nDo not run the google_meet_create_event plugin action.",
    },
  ],
};

const CONNECT_PROMPT: PermissionPrompt = {
  kind: "connect",
  action: "Notion",
  pluginKey: "notion",
  connectionStatus: "not_connected",
};

const BLOCKED_PROMPT: PermissionPrompt = {
  kind: "blocked",
  action: "Figma",
  pluginKey: "figma",
  message: "An administrator has to register this app before it can be used.",
};

const PLUGINS: AssistantPluginCatalogItemDto[] = [
  {
    key: "google_meet",
    label: "Google Meet",
    description: "Create and manage Google Meet meetings.",
    requiredScopes: [],
    grantedScopes: [],
    installationStatus: "installed",
    connectionStatus: "connected",
    tools: [],
  },
  {
    key: "notion",
    label: "Notion",
    description: "Read and write Notion pages.",
    requiredScopes: [],
    grantedScopes: [],
    installationStatus: "installed",
    connectionStatus: "not_connected",
    tools: [],
  },
  {
    key: "figma",
    label: "Figma",
    description: "Read Figma files.",
    requiredScopes: [],
    grantedScopes: [],
    installationStatus: "not_installed",
    connectionStatus: "not_connected",
    tools: [],
  },
];

/** The composer the form sits in, at whatever width is being looked at. */
function Composer({ title, width, children }: {
  title: string;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[13px] font-medium text-ink-muted">
        {title} · {width}px
      </h2>
      <div
        className="overflow-hidden rounded-xl border border-border bg-surface-1"
        style={{ width }}
      >
        {children}
        <div className="px-3 py-2.5 text-[12.5px] text-ink-subtle">Ask WarpBot...</div>
      </div>
    </div>
  );
}

const TURN_MS = 2500;

export default function PermissionPromptPreviewPage() {
  // The live one: a surface's two signals, and nothing else.
  const [answered, setAnswered] = useState(false);
  const [turnEndedAt, setTurnEndedAt] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  function restart() {
    setAnswered(false);
    setTurnEndedAt(null);
    setDismissed(false);
    setSent(null);
  }

  return (
    <main className="min-h-screen bg-canvas p-8 text-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header>
          <h1 className="text-lg font-semibold">Permission prompt preview</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            The form above the composer, in the states a write takes it through.
          </p>
        </header>

        <section className="flex flex-wrap items-start gap-8">
          <Composer title="asking" width={460}>
            <AssistantPermissionPrompt
              prompt={TOOL_PROMPT}
              plugins={PLUGINS}
              onAnswer={() => {}}
              onConnect={() => {}}
              onDismiss={() => {}}
            />
          </Composer>
          <Composer title="asking, narrow" width={360}>
            <AssistantPermissionPrompt
              prompt={TOOL_PROMPT}
              plugins={PLUGINS}
              onAnswer={() => {}}
              onConnect={() => {}}
              onDismiss={() => {}}
            />
          </Composer>
        </section>

        <section className="flex flex-wrap items-start gap-8">
          <Composer title="running" width={460}>
            <AssistantPermissionPrompt
              prompt={TOOL_PROMPT}
              plugins={PLUGINS}
              answered
              turnEndedAt={null}
              onAnswer={() => {}}
              onConnect={() => {}}
              onDismiss={() => {}}
            />
          </Composer>
          <Composer title="done" width={460}>
            <AssistantPermissionPrompt
              prompt={TOOL_PROMPT}
              plugins={PLUGINS}
              answered
              turnEndedAt={1}
              onAnswer={() => {}}
              onConnect={() => {}}
              onDismiss={() => {}}
            />
          </Composer>
        </section>

        <section className="flex flex-wrap items-start gap-8">
          <Composer title="connect" width={460}>
            <AssistantPermissionPrompt
              prompt={CONNECT_PROMPT}
              plugins={PLUGINS}
              onAnswer={() => {}}
              onConnect={() => {}}
              onDismiss={() => {}}
            />
          </Composer>
          <Composer title="blocked" width={460}>
            <AssistantPermissionPrompt
              prompt={BLOCKED_PROMPT}
              plugins={PLUGINS}
              onAnswer={() => {}}
              onConnect={() => {}}
              onDismiss={() => {}}
            />
          </Composer>
        </section>

        <section className="flex flex-col gap-3">
          <Composer title="live — press an answer" width={460}>
            {dismissed ? null : (
              <AssistantPermissionPrompt
                prompt={TOOL_PROMPT}
                plugins={PLUGINS}
                answered={answered}
                turnEndedAt={turnEndedAt}
                onAnswer={(message) => {
                  // What a surface does: send it, keep the form, and report the turn's end when
                  // the reply lands. The timer stands in for the round trip.
                  setSent(message);
                  setAnswered(true);
                  setTurnEndedAt(null);
                  window.setTimeout(() => setTurnEndedAt(Date.now()), TURN_MS);
                }}
                onConnect={() => {}}
                onDismiss={() => setDismissed(true)}
              />
            )}
          </Composer>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={restart}
              className="rounded-md border border-border bg-surface-1 px-2 py-1 text-[12px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Reset
            </button>
            <p className="text-[12px] text-ink-subtle">
              {dismissed
                ? "Dismissed — the receipt took itself off the screen."
                : sent
                  ? "Sent, unchanged, to the model:"
                  : "Nothing sent yet."}
            </p>
          </div>
          {sent ? (
            <pre className="max-w-[640px] whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11.5px] text-ink-muted">
              {sent}
            </pre>
          ) : null}
        </section>
      </div>
    </main>
  );
}
