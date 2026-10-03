"use client";

/**
 * The in-meeting "dub you in your own voice?" card, without a live meeting to trigger it.
 *
 * It only appears once translation is running, the speaker is talking, and the TTS worker has
 * answered `not_opted_in` for them — none of which a local checkout can produce. Same purpose as
 * the other dev/* previews: not a test, a place to SEE it. The pipeline states on the left drive
 * the real decision function, so the card appears and disappears exactly as it would in a call.
 */

import { useState } from "react";

import { VoiceCloneConsentPrompt } from "@/components/rooms/live/voice-clone-consent-prompt";
import { shouldPromptVoiceClone } from "@/lib/meeting/voice-clone-prompt";

const REASONS = ["not_opted_in", "no_routes", "capturing", "cloned", "carried_over"] as const;

export default function VoiceClonePromptPreviewPage() {
  const [reason, setReason] = useState<string>("not_opted_in");
  const [dubVoiceId, setDubVoiceId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);

  const visible = shouldPromptVoiceClone({ cloneReason: reason, dubVoiceId, dismissed });

  return (
    <main className="min-h-screen bg-canvas p-8 text-ink">
      <h1 className="text-lg font-semibold">Voice clone consent prompt</h1>
      <p className="mt-1 max-w-xl text-sm text-ink-muted">
        Pick the state the pipeline reports for you. The card shows only for{" "}
        <code>not_opted_in</code>, with no dub voice chosen, until dismissed.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {REASONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setReason(value)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              reason === value ? "border-primary bg-primary/10" : "border-border bg-surface-1"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={dubVoiceId !== null}
            onChange={(event) => setDubVoiceId(event.target.checked ? "voice-preview" : null)}
          />
          Has a chosen dub voice
        </label>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5"
          onClick={() => setDismissed(false)}
        >
          Reset dismissal
        </button>
      </div>

      <p className="mt-4 text-sm">
        Card visible: <strong>{visible ? "yes" : "no"}</strong>
      </p>

      {visible ? (
        <VoiceCloneConsentPrompt
          pending={pending}
          onAllow={() => {
            setPending(true);
            window.setTimeout(() => {
              setPending(false);
              setDismissed(true);
            }, 800);
          }}
          onDismiss={() => setDismissed(true)}
        />
      ) : null}
    </main>
  );
}
