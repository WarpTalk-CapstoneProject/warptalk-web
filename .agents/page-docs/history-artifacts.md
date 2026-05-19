# History & Artifacts Page Documentation

This document tracks the WT-97 host history UI at `/history`.

---

## Purpose

`/history` is the post-meeting surface for ended rooms. It lets hosts review room metadata, transcript availability, AI summaries, retention/consent indicators, and linked artifacts after the live room has ended.

## Linear Scope

Source ticket: `WT-97 - FE 1.7 Build Room History and Artifact UI`.

Acceptance coverage:
- Shows ended room history with title, ended time, host, participants, status, duration, and language summary.
- Shows artifacts for transcript exports, summary exports, optional recordings, debug logs, and audio samples.
- Covers loading, empty, permission denied, error, expired artifact, and missing artifact states.
- Uses a typed mock adapter until backend exposes dedicated artifact APIs.
- Documents frontend/backend mapping for transcript, recording/artifact, summary, retention, and consent fields.

## Files

- `src/app/(app)/history/page.tsx`
- `src/services/roomHistory.service.ts`
- `src/hooks/use-room-history.ts`
- `src/types/roomHistory.ts`
- `src/components/layout/host-sidebar.tsx` links to `/history` as `History & Transcripts`.

## Current Data Contract

The page uses `roomHistoryService.listEndedRooms()` as a typed mock adapter. It is designed to be replaced by real endpoints without rewriting the UI.

Proposed backend endpoints:
- `GET /translationRooms/history?status=ended`
- `GET /translationRooms/{id}/artifacts`

Current backend/schema sources used by the adapter:
- `TranslationRoom`: `title`, `host_id`, `status`, `started_at`, `ended_at`, `duration_seconds`, `source_language`, `target_languages`.
- `TranslationRoomParticipant`: participant name, role, speak/listen languages, join/leave state.
- `Transcript`: `translation_room_id`, `version`, `status`, `source_language`, `total_segments`, `total_duration_ms`, `finalized_at`.
- `transcript_exports`: export `format`, `file_url`, included languages, export creation time.
- `TranslationRoomRecording`: `recording_type`, `file_url`, `file_format`, `file_size_bytes`, `duration_seconds`, `language`, `status`, `created_at`.
- `TranslationRoomSummary`: `summary`, `key_points`, `decisions`, `action_items`, `model_used`, `processing_time_ms`, `generated_at`.

## UI Notes

- The layout is intentionally operational, not a live meeting screen: room list on the left, selected ended-room detail on the right.
- Transcript and AI summary cards are inspired by the provided live meeting references but converted into review/export cards.
- Palette stays aligned with the project preference: `#fdfcf6`, `#003476`, `#e4eef9`, black, white, and neutral slate.
- State preview controls are temporary demo controls for validating acceptance states while the API is incomplete.

## Known Limitations

- Artifact downloads point to mock URLs.
- Retention and consent fields are adapter metadata because backend entities currently do not expose explicit `expires_at`, `retention_days`, or `consent_status` columns.
- Search input is visual only until history filtering endpoints exist.

## Testing Checklist

- [ ] `/history` renders with the host sidebar active.
- [ ] Room cards switch the selected ended room.
- [ ] Artifact filters show ready, expired, and missing subsets.
- [ ] Loading, empty, permission denied, and error state previews render.
- [ ] Expired and missing artifacts do not show the download action.
- [ ] Summary panel shows key points, decisions, and action items.
- [ ] Frontend/backend mapping panel matches the adapter fields.
