"use client";

/**
 * The post-meeting transcript, rendered against a multilingual fixture.
 *
 * WHY IT EXISTS
 *   The surface this stands in for needs a finished meeting, its persisted segments, AND the
 *   translations the dubbing produced for every one of them. None of that is reachable from a
 *   laptop, so the only way to LOOK at this panel has been to deploy it and find a meeting where
 *   two languages were actually spoken. That is how it stayed an interleaving of two languages
 *   for as long as it did — nobody who could change it was ever looking at one.
 *
 *   It renders the real `MeetingTranscriptArtifact`, not a copy of its layout, so what is on
 *   screen here is what the room page shows: the same language options built by the same
 *   function, the same fallback for a line the meeting never translated, the same two layouts.
 *
 * THE FIXTURE
 *   A Vietnamese/Japanese/English meeting, of the shape that made this hard to read: one speaker
 *   switching languages mid-meeting, one utterance split across two STT chunks (so the merged
 *   translation has to be reassembled from both), and one Japanese line that was never
 *   translated into Vietnamese.
 */

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { MeetingTranscriptArtifact } from "@/components/rooms/meeting-transcript-panel";
import type { TranscriptSegmentDto, TranscriptTranslationDto } from "@/types/transcript";

const TU = "019f0d00-0de0-7000-9000-000000000001";
const TUAN = "019f0d00-0de0-7000-9000-000000000002";

/** [speakerId, speakerName, language, text, startSeconds] */
type SpokenLine = readonly [string, string, string, string, number];

// i18n-allow: a transcript fixture of a meeting held in three languages. The languages ARE the
// subject here — an English-only fixture would render a panel that cannot show what it is for.
const SPOKEN: readonly SpokenLine[] = [
  [TUAN, "Trần Mạnh Tuấn", "vi", "Rồi, đợi chút nha, để đọc tiếng Nhật.", 12],
  [TUAN, "Trần Mạnh Tuấn", "ja", "はじめまして、私はトゥアンです。よろしくお願いします。", 24],
  [TUAN, "Trần Mạnh Tuấn", "ja", "AIで日本語を勉強できます。", 27],
  [TU, "Huỳnh Thái Tú", "vi", "Nhưng mà nó vẫn hiện được hai thứ tiếng đấy chứ?", 41],
  [TUAN, "Trần Mạnh Tuấn", "vi", "Ừ, nó đang hơi chậm một chút,", 54],
  [TUAN, "Trần Mạnh Tuấn", "vi", "nhưng bản dịch thì vẫn đúng.", 56],
  [TU, "Huỳnh Thái Tú", "en", "Let us keep the summary in Vietnamese then.", 70],
];

/** [segmentIndex, language, text] — the translations the meeting actually produced. */
type TranslatedLine = readonly [number, string, string];

// i18n-allow: the dubbing output for the lines above, which is what the panel unifies on.
const TRANSLATED: readonly TranslatedLine[] = [
  [0, "ja", "はい、少々お待ちください。日本語を読みます。"],
  [0, "en", "Alright, give me a second, let me read the Japanese."],
  [1, "vi", "Rất vui được gặp bạn, tôi là Tuấn. Rất mong được hợp tác."],
  [1, "en", "Nice to meet you, I am Tuan. I look forward to working with you."],
  [2, "en", "I can study Japanese with AI."],
  [3, "ja", "でも、二つの言語を同時に表示できますよね？"],
  [3, "en", "But it can still show both languages, right?"],
  [4, "ja", "ええ、少し遅いですが、"],
  [4, "en", "Yeah, it is running a little slow,"],
  [5, "ja", "翻訳は正しいです。"],
  [5, "en", "but the translation is still right."],
  [6, "vi", "Vậy thì mình để bản tóm tắt bằng tiếng Việt nhé."],
  [6, "ja", "それでは、要約はベトナム語にしましょう。"],
];

const segmentId = (index: number) => `segment-${index}`;

// Segment 2 is deliberately left with no Vietnamese translation: a reader who unifies on
// Vietnamese must be told that line stayed in Japanese rather than shown it unmarked.
const SEGMENTS: TranscriptSegmentDto[] = SPOKEN.map(
  ([speakerId, speakerName, language, text, startSeconds], index) => ({
    id: segmentId(index),
    speakerParticipantId: speakerId,
    speakerName,
    originalText: text,
    originalLanguage: language,
    confidence: -0.23,
    startTimeMs: startSeconds * 1_000,
    // Lines 4 and 5 are one sentence split by the recogniser: the gap is under the merge
    // threshold, so they become one bubble and their translations have to be rejoined.
    endTimeMs: startSeconds * 1_000 + 1_500,
    sequenceOrder: index,
  }),
);

const TRANSLATIONS: TranscriptTranslationDto[] = TRANSLATED.map(
  ([index, language, text], row) => ({
    id: `translation-${row}`,
    segmentId: segmentId(index),
    targetLanguage: language,
    translatedText: text,
    translatorModel: "gpt-5.6-luna",
    confidence: -0.18,
    isRetranslated: false,
    latencyMs: 420,
  }),
);

export default function TranscriptPreviewPage() {
  // ?theme=light / ?theme=dark. Both themes have to be looked at, and the machine doing the
  // looking follows the OS — which pins it to one of them and hides every regression in the
  // other.
  const { setTheme } = useTheme();
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    if (requested === "light" || requested === "dark") setTheme(requested);
  }, [setTheme]);

  return (
    <div className="flex min-h-dvh flex-col gap-8 bg-surface-1 p-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
          Ended meeting · host · the reader speaks Vietnamese
        </h2>
        <div className="rounded-[14px] border border-border bg-surface-1 p-5">
          <MeetingTranscriptArtifact
            segments={SEGMENTS}
            translations={TRANSLATIONS}
            preferredLanguage="vi-VN"
            baseTime="2026-08-21T00:16:00.000Z"
            roomId="preview-room"
            currentUserId={TU}
            isEnded
            onCopy={() => {}}
            transcriptId="preview-transcript"
            transcriptStatus="finalized"
            canEdit
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
          Same meeting, still correctable — the pencil and the language chips share a row
        </h2>
        <div className="rounded-[14px] border border-border bg-surface-1 p-5">
          <MeetingTranscriptArtifact
            segments={SEGMENTS}
            translations={TRANSLATIONS}
            preferredLanguage="ja"
            baseTime="2026-08-21T00:16:00.000Z"
            roomId="preview-room"
            currentUserId={TUAN}
            isEnded
            onCopy={() => {}}
            transcriptId="preview-transcript"
            transcriptStatus="recording"
            canEdit
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
          A meeting held in one language — no picker worth showing, nothing to unify
        </h2>
        <div className="rounded-[14px] border border-border bg-surface-1 p-5">
          <MeetingTranscriptArtifact
            segments={SEGMENTS.slice(6)}
            translations={[]}
            preferredLanguage="vi-VN"
            baseTime="2026-08-21T00:16:00.000Z"
            roomId="preview-room"
            currentUserId={TU}
            isEnded
            onCopy={() => {}}
            transcriptId="preview-transcript"
          />
        </div>
      </section>
    </div>
  );
}
