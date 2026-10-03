"use client";

/**
 * The in-meeting Voice panel, rendered against fixtures. WT-927.
 *
 * WHY IT EXISTS
 *   The panel only appears inside a live meeting, behind Settings → Voice, with a voice catalogue
 *   warmed by the AI worker and uploaded profiles on the account. None of that is reachable from a
 *   laptop, so the only way to look at the list had been to join a production meeting — which is
 *   how it shipped with no visible selection and every detail line title-cased.
 *
 *   Three panels side by side, one per state the summary under the list can name: nothing chosen
 *   (Automatic), a cloned voice, and an uploaded profile. Each one is live — picking a row moves
 *   the selection — so hover, focus and the radio mark can be checked with a mouse and a keyboard.
 *
 * ?theme=light / ?theme=dark switches theme.
 */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { VoicePanel } from "@/components/rooms/live/voice-panel";
import type { VoiceOptionDto } from "@/types/realtime";

const CATALOG: VoiceOptionDto[] = [
  { id: "lib-aila", name: "Aila - Paced Helper", gender: "feminine" },
  { id: "lib-ailsa", name: "Ailsa - Warm Guide", gender: "feminine" },
  { id: "lib-aina", name: "Aina - Meditation Guru", gender: "feminine" },
  { id: "lib-clive", name: "Clive - Measured Expert", gender: "masculine" },
  { id: "lib-owen", name: "Owen - Steady Host", gender: "masculine" },
];

const PROFILES = [
  { id: "p-en", name: "My voice (en)", voiceId: "own-en" },
  { id: "p-parker", name: "Parker - Supportive Pal", voiceId: "own-parker" },
  { id: "p-linh", name: "Linh - Soft Presence", voiceId: "own-linh" },
];

function PreviewPanel({
  title,
  initialClone,
  initialDubVoice,
}: {
  title: string;
  initialClone: boolean;
  initialDubVoice: string | null;
}) {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceCloneEnabled, setVoiceCloneEnabled] = useState(initialClone);
  const [dubVoice, setDubVoice] = useState<string | null>(initialDubVoice);
  const [voicePreference, setVoicePreference] = useState("");

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12px] font-medium text-ink-muted">{title}</h2>
      <div className="max-h-[720px] w-[340px] overflow-y-auto rounded-xl border border-border bg-surface-1 py-1 shadow-lg">
        <VoicePanel
          mode="meeting"
          voiceEnabled={voiceEnabled}
          onChangeVoiceEnabled={setVoiceEnabled}
          voicePreference={voicePreference}
          voiceCatalog={CATALOG}
          onChangeVoicePreference={setVoicePreference}
          voiceCloneEnabled={voiceCloneEnabled}
          voiceCloneHasAudience
          onChangeVoiceCloneConsent={setVoiceCloneEnabled}
          dubVoice={dubVoice}
          ownVoiceProfiles={PROFILES}
          onChangeDubVoice={setDubVoice}
        />
      </div>
    </section>
  );
}

export default function VoicePanelPreviewPage() {
  const { setTheme } = useTheme();
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    if (requested === "light" || requested === "dark") setTheme(requested);
  }, [setTheme]);

  return (
    <main className="min-h-screen bg-surface-2 p-8">
      <div className="flex flex-wrap items-start gap-6">
        <PreviewPanel title="Nothing chosen" initialClone={false} initialDubVoice={null} />
        <PreviewPanel title="Cloned live" initialClone initialDubVoice={null} />
        <PreviewPanel title="Uploaded profile" initialClone={false} initialDubVoice="own-parker" />
      </div>
    </main>
  );
}
