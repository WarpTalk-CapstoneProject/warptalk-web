"use client";

/**
 * The in-meeting layout, rendered against fixtures.
 *
 * WHY IT EXISTS
 *   Everything on this page is gated on things a laptop does not have: a running gateway, a live
 *   LiveKit room, two other people, and an AI pipeline emitting transcript segments. The layout
 *   decisions that matter most — how much of the window the picture takes, how much the caption
 *   lane takes, whether three attributed caption lines are readable at a glance — cannot be
 *   reviewed without all of that, which in practice meant they were never reviewed at all and
 *   were tuned in production during a real meeting.
 *
 *   So the pieces that carry no LiveKit context (the caption lane, the participant avatar with
 *   its language flag, the clone-capture meter) render here against canned data, at the same
 *   sizes the real session gives them.
 *
 * IT IS NOT THE MEETING
 *   The video stage, the control bar and the transcript panel all need a room context, so this
 *   page stands in for their chrome rather than mounting them. It can show that a caption lane
 *   at `clamp(96px,15vh,148px)` holds three lines; it cannot show that the stage renders.
 */

import { useEffect } from "react";
import { LiveSubtitleOverlay } from "@/components/rooms/live/live-subtitle-overlay";
import { MeetingIdentityProvider } from "@/components/rooms/live/meeting-identity-context";
import { ParticipantAvatar } from "@/components/rooms/live/participant-avatar";
import { CloneCaptureMeter } from "@/components/rooms/live/clone-capture-meter";
import { TranscriptPanel } from "@/components/rooms/live/side-panel/transcript-panel";
import { buildParticipantIdentities } from "@/lib/meeting/participant-identity";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";

const identities = buildParticipantIdentities({
  participants: [
    { userId: "u1", displayName: "Huynh Thai Tu", speakLanguage: "vi-VN", listenLanguage: "vi-VN" },
    { userId: "u2", displayName: "Sarah Mitchell", speakLanguage: "en-US", listenLanguage: "vi-VN" },
    { userId: "u3", displayName: "Kenji Watanabe", speakLanguage: "ja-JP", listenLanguage: "ja-JP" },
  ],
  members: [
    { userId: "u2", fullName: "Sarah Mitchell", avatarUrl: "https://i.pravatar.cc/120?img=47" },
  ],
});

// i18n-allow: these are TRANSCRIPT LINES, not interface copy. A caption lane for a translation
// product has to be reviewed with the languages it will actually carry — three English sentences
// would prove nothing about how Vietnamese diacritics or Japanese glyphs sit on the row.
const SEGMENTS = [
  { speakerId: "u1", speakerName: "Huynh Thai Tu", text: "Chào mọi người, hôm nay chúng ta sẽ review lại toàn bộ luồng dịch." , lang: "vi"},
  { speakerId: "u2", speakerName: "Sarah Mitchell", text: "Sounds good — can you walk me through the latency numbers first?", lang: "en" },
  { speakerId: "u3", speakerName: "Kenji Watanabe", text: "遅延の数字を先に確認しましょう。", lang: "ja" },
];

export default function MeetingLayoutPreview() {
  const segments = useTranslationRoomStore((state) => state.transcriptSegments);

  useEffect(() => {
    useTranslationRoomStore.setState({
      transcriptSegments: SEGMENTS.map((segment, index) => ({
        segmentId: `s${index}`,
        speakerId: segment.speakerId,
        speakerName: segment.speakerName,
        originalText: segment.text,
        originalLanguage: segment.lang,
        confidence: -0.2,
        startTimeMs: index * 4000,
        endTimeMs: index * 4000 + 3000,
        receivedAt: Date.now(),
      })),
    });
  }, []);

  return (
    <MeetingIdentityProvider identities={identities}>
      <div className="min-h-screen bg-canvas p-6 text-ink">
        <div className="mx-auto flex h-[720px] max-w-5xl flex-col gap-2.5 rounded-2xl bg-surface-1 p-2.5">
          <section className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[24px] bg-surface-1">
            <div className="absolute left-4 top-4 rounded-full border border-border/70 bg-surface-1/90 px-2.5 py-1 text-[12px] font-medium">
              00:04:12
            </div>
            <div className="relative h-full w-full">
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-1">
                <ParticipantAvatar identity={identities.u1} size="xl" speaking />
                <div className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] font-medium text-ink-muted">
                  Camera is off
                </div>
              </div>
              <div className="pointer-events-none absolute bottom-5 left-5 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-[13px] font-medium text-white">
                <span className="text-[12px]">🇻🇳</span>
                <span>Huynh Thai Tu</span>
              </div>
              <span className="pointer-events-none absolute inset-0 z-30 rounded-[24px] ring-2 ring-inset ring-primary" />
            </div>
          </section>

          <div className="relative flex h-[clamp(96px,15vh,148px)] shrink-0 items-stretch justify-center overflow-hidden">
            <LiveSubtitleOverlay enabled />
          </div>

          <div className="flex shrink-0 items-center justify-center gap-2">
            <div className="flex h-[52px] items-center gap-1.5 rounded-full border border-border/50 bg-surface-1/80 px-2.5 shadow-sm">
              <span className="flex h-9 items-center rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground">
                Start Translation
              </span>
              <span className="flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[13px] font-medium">
                🇻🇳 Vietnamese
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2">CC</span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2">A</span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2">B</span>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-full border border-border/50 bg-surface-1/80 text-destructive">
              ⏻
            </span>
          </div>
        </div>

        <div className="mx-auto mt-6 flex max-w-5xl flex-wrap items-start gap-6">
          <div className="flex h-[320px] w-[340px] flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
            <p className="border-b border-border px-3 py-2 text-[12px] font-medium">Transcript</p>
            <TranscriptPanel
              segments={segments}
              roomId="preview"
              readerLanguage="en"
            />
          </div>

          {/* WT-605. Here rather than in a preview of its own because the point of the notice is
              how it sits ABOVE a transcript that has stopped growing — a screenshot of the notice
              alone would not show the thing being judged. Two panels: paused with a start time
              (learned from the window list) and paused without one (learned from the broadcast,
              which carries no time). */}
          <div className="flex h-[320px] w-[340px] flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
            <p className="border-b border-border px-3 py-2 text-[12px] font-medium">
              Transcript · paused, start time known
            </p>
            <TranscriptPanel
              segments={segments}
              roomId="preview-paused"
              readerLanguage="en"
              transcriptPause={{ paused: true, since: "2026-09-06T10:05:00Z" }}
            />
          </div>

          <div className="flex h-[320px] w-[340px] flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
            <p className="border-b border-border px-3 py-2 text-[12px] font-medium">
              Transcript · paused before anyone spoke
            </p>
            <TranscriptPanel
              segments={[]}
              roomId="preview-paused-empty"
              readerLanguage="en"
              transcriptPause={{ paused: true, since: null }}
            />
          </div>
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface-1 p-3">
          <p className="text-[12px] font-medium">Listening to your voice</p>
          <CloneCaptureMeter
            tone="working"
            progress={0.55}
            levels={[0.1, 0.3, 0.62, 0.8, 0.74, 0.55, 0.2, 0.08, 0.05, 0.35, 0.66, 0.71, 0.83, 0.6, 0.44, 0.12, 0.06, 0.4, 0.7]}
          />
          <p className="mt-1.5 text-[11px] text-ink-muted">11s of 20s collected.</p>
          </div>
        </div>
      </div>
    </MeetingIdentityProvider>
  );
}
