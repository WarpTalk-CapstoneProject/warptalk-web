# Transcript: Clean vs Verbatim (WT-716)

How every transcript surface decides which words to print.

## Current Behavior

- The transcript reads **Clean** by default: filler words (`um`, `ờ`, `えーと`) and stutters removed,
  punctuation repaired (including `?` / `？`), and — where the backend has merged them — one whole
  sentence per line instead of one recogniser chunk per line.
- **Verbatim** shows the stored record exactly as it is: the raw `originalText`, segmented as today.
- The choice is **per reader**, kept in `localStorage` under `warptalk.transcript.view-mode`, and
  shared by every surface the reader has open (including the Meet widget window, which hears the
  `storage` event). It never changes what anybody else in the room sees.
- A sentence flagged `self_repair` ("họp thứ hai, à không, thứ ba" → "Họp thứ ba.") carries a small
  marker whose hover shows the raw words of the segments behind it, without leaving Clean.
- Segments whose whole content was filler (`cleanText === ""`) are hidden in Clean, shown in Verbatim.
- Corrections always operate on RAW segments: opening the editor from a Clean line seeds it with the
  raw text of the segments that line stands for.
- Backward compatible: `cleanText` null/absent (an old meeting, or a line a correction just rewrote)
  renders `originalText` in both views.

## Surfaces

| Surface | File | Toggle |
| --- | --- | --- |
| Live side panel | `src/components/rooms/live/side-panel/transcript-panel.tsx` | own row above the list |
| Caption lane | `src/components/rooms/live/live-subtitle-overlay.tsx` | none — follows the shared preference |
| Meeting record | `src/components/rooms/meeting-transcript-panel.tsx` | toolbar, beside the layout toggle |
| Meet widget / desktop transcript | `src/components/rooms/bridge/widget/transcript-pane.tsx` | above the scroller |

## Files Affected

- `src/lib/transcript/clean-transcript.ts` — all the rules (view mode, sentence/segment merge,
  staleness, revision upsert, per-bubble lines), with tests in `__tests__/clean-transcript.test.ts`.
- `src/components/rooms/transcript-clean-controls.tsx` — the shared toggle and self-repair marker.
- `src/hooks/use-transcripts.ts` — `useTranscriptCleanSentences`, `useTranscriptViewMode`.
- `src/services/transcript.service.ts`, `src/lib/api/endpoints.ts` — the clean-sentences read.
- `src/stores/translationRoom-store.ts`, `src/components/rooms/live/persistent-meeting-session.tsx`
  — the `TranscriptCleanSentenceReceived` broadcast.
- `src/types/transcript.ts`, `src/types/realtime.ts` — `cleanText`, `cleanFlags`, the sentence DTOs.

## Backend Contract

- `GET /transcripts/{id}/segments` items carry `cleanText: string | null` and `cleanFlags: string[]`.
- `GET /transcripts/{id}/clean-sentences?skip&take` → `{ totalCount, items }`, conversation order.
- `TranscriptSegmentReceived` carries `cleanText` / `cleanFlags`; `TranscriptCleanSentenceReceived`
  carries a whole sentence, highest `revision` per `id` wins.
- A correction clears the segment's `cleanText` server-side but does NOT invalidate stored
  sentences, so the client refuses a sentence whose segments are corrected, changed after it, or
  missing, and renders those segments individually instead.

## Testing Checklist

- [ ] Clean is the default on a fresh browser; switching to Verbatim survives a reload and a second
      surface opened in the same browser.
- [ ] A filler-only line is absent in Clean and present in Verbatim.
- [ ] A merged sentence renders once, on one line, and its timestamp/seek still points at the first
      segment of the span.
- [ ] A citation from a summary still scrolls to and highlights the right line in both views.
- [ ] Editing a line while in Clean opens the raw wording; saving it spreads across the raw rows.
- [ ] A corrected line's sentence falls back to per-segment rendering rather than showing the old
      wording.
