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
 *   Three panels side by side at the bar's real 256px: Off, Live cloning mid-capture, and a saved
 *   profile. Each one is live — picking a row moves the selection, the language chip filters the
 *   library and Show all opens it — so hover, focus and the radio mark can be checked by hand. The
 *   library reads its catalogues over REST, so they are seeded into the query cache under the key
 *   useVoiceCatalogs reads. Play buttons have no backend here and show the preview error.
 *
 * ?theme=light / ?theme=dark switches theme.
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";

import { VoicePanel } from "@/components/rooms/live/voice-panel";
import { Switch } from "@/components/ui/switch";
import { VOICE_PROFILE_KEYS } from "@/hooks/use-voice-profiles";
import type { VoiceCloneStateDto, VoiceOptionDto } from "@/types/realtime";
import type { VoiceCatalogItemDto } from "@/types/voice-profile";

/** The library by language, as GET /voice-profiles/catalog?language= returns it. */
const LIBRARY: Record<string, VoiceCatalogItemDto[]> = {
  vi: [
    { id: "lib-lien", name: "Lien", gender: "feminine" },
    { id: "lib-linh", name: "Linh", gender: "feminine" },
    { id: "lib-xia", name: "Xia", gender: "feminine" },
    { id: "lib-hoa", name: "Hoa", gender: "feminine" },
    { id: "lib-minh", name: "Minh", gender: "masculine" },
    { id: "lib-khang", name: "Khang", gender: "masculine" },
  ],
  en: [
    { id: "lib-katie", name: "Katie", gender: "feminine" },
    { id: "lib-brooke", name: "Brooke", gender: "feminine" },
    { id: "lib-ronald", name: "Ronald", gender: "masculine" },
    { id: "lib-blake", name: "Blake", gender: "masculine" },
  ],
  ja: [
    { id: "lib-aiko", name: "Aiko", gender: "feminine" },
    { id: "lib-sakura", name: "Sakura", gender: "feminine" },
    { id: "lib-naoki", name: "Naoki", gender: "masculine" },
  ],
};

const CAPTURING: VoiceCloneStateDto = {
  speakerId: "preview-user",
  reason: "capturing",
  seconds: 12,
  requiredSeconds: 20,
};

const CATALOG: VoiceOptionDto[] = [
  { id: "lib-aila", name: "Aila - Paced Helper", gender: "feminine" },
  { id: "lib-ailsa", name: "Ailsa - Warm Guide", gender: "feminine" },
  { id: "lib-aina", name: "Aina - Meditation Guru", gender: "feminine" },
  { id: "lib-clive", name: "Clive - Measured Expert", gender: "masculine" },
  { id: "lib-owen", name: "Owen - Steady Host", gender: "masculine" },
];

const PROFILES = [
  { id: "p-carry", name: "My voice (vi-VN)", voiceId: "own-carry", language: "vi-VN" },
  { id: "p-talk", name: "Tú · giọng thuyết trình", voiceId: "own-talk", language: "vi-VN" },
];

function PreviewPanel({
  title,
  initialClone,
  initialDubVoice,
  cloneCapture,
}: {
  title: string;
  initialClone: boolean;
  initialDubVoice: string | null;
  cloneCapture?: VoiceCloneStateDto | null;
}) {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceCloneEnabled, setVoiceCloneEnabled] = useState(initialClone);
  const [dubVoice, setDubVoice] = useState<string | null>(initialDubVoice);
  const [voicePreference, setVoicePreference] = useState("");
  const [flashMode, setFlashMode] = useState(true);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12px] font-medium text-ink-muted">{title}</h2>
      <div className="max-h-[760px] w-64 overflow-y-auto rounded-lg border border-border bg-surface-1 p-1 shadow-lg">
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
          speakLanguage="vi-VN"
          cloneCapture={voiceCloneEnabled ? cloneCapture : null}
          footer={
            <div className="flex w-full items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0 text-left">
                <span className="block text-[13px] font-medium text-ink">Flash mode</span>
                <span className="block text-[11px] leading-snug text-ink-subtle">
                  Start translating while people are still speaking. Faster, and still experimental.
                </span>
              </span>
              <Switch size="sm" className="mt-0.5 shrink-0" checked={flashMode} onCheckedChange={(checked) => setFlashMode(Boolean(checked))} />
            </div>
          }
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

  const queryClient = useQueryClient();
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    for (const [language, voices] of Object.entries(LIBRARY)) {
      queryClient.setQueryData(VOICE_PROFILE_KEYS.catalog(language), voices);
    }
    setSeeded(true);
  }, [queryClient]);
  if (!seeded) return null;

  return (
    <main className="min-h-screen bg-surface-2 p-8">
      <div className="flex flex-wrap items-start gap-6">
        <PreviewPanel title="Off" initialClone={false} initialDubVoice={null} />
        <PreviewPanel title="Live cloning, capturing" initialClone initialDubVoice={null} cloneCapture={CAPTURING} />
        <PreviewPanel title="Saved profile" initialClone={false} initialDubVoice="own-talk" />
      </div>
    </main>
  );
}
