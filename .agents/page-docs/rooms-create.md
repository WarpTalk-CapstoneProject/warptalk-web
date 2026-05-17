# Rooms Create Page Documentation

This document tracks the current behavior and maintenance notes for the host Create Room flow at `/rooms/create`.

---

## Schedule Layout Refresh

**What changed:**
- Removed the Step 1 sidebar `Checklist` card so the right column focuses on `Setup Summary`.
- Removed the Step 2 sidebar `Setup Checklist` card for consistency.
- Changed `Schedule for later` and `Start now` from native circular radio inputs to square selectable controls with a check mark.
- Reworked Step 2 into a single minimal room setup surface instead of four numbered cards.
- Changed Step 2 access, join, and permissions choices to square selectable tiles with a check mark.
- Simplified Step 2 spacing by grouping basics, access, languages, and terminology files with section dividers.
- Reworked the Step 1 schedule fields:
  - `Date *` supports direct text entry and a mini calendar table picker.
  - `Start Time *` supports direct text entry, browser datalist suggestions, and a scrollable 15-minute interval picker.
  - `Time Zone *` supports direct text entry and a datalist generated from the runtime world's IANA timezone list via `Intl.supportedValuesOf("timeZone")`.
- Replaced fragile emoji flag rendering with a stable `US` language badge.
- Added room-level language policy controls:
  - `sourceLanguage` is selected from typed supported language config in `src/lib/languages.ts`.
  - `targetLanguages` supports single-language mode with one target or multi-language mode with up to three targets.
  - The summary shows the selected source, target count, and language mode.

**Why it changed:**
The schedule section needed to feel closer to the provided host design while becoming more practical for real meeting setup. Hosts should be able to either type quickly or choose from structured pickers without being locked into a static hard-coded field.
The Step 2 room setup layout needed to reduce wasted space and remove visual noise from numbered cards. The new layout keeps the same form content but makes selection states clearer and easier to scan.

**Files affected:**
- `src/app/(app)/rooms/create/page.tsx`

**How the page currently works:**
- Step 1 captures meeting title, schedule mode, date, start time, timezone, and primary language.
- Step 1 now labels that field as the room source language. It still writes to the existing local `primaryLanguage` form key, then maps to backend `sourceLanguage`.
- Step 1 `Setup Summary` mirrors the current form state and formats ISO date values into readable text.
- Step 2 captures room basics, access, language setup, and terminology files in one continuous form.
- Step 2 language setup maps to backend create DTO fields:
  - `sourceLanguage`: selected source language code, for example `en`.
  - `targetLanguages`: comma-serialized target language codes, for example `es,vi,ja`, matching the backend string field.
- The bottom action bar continues to handle navigation between Step 1 and Step 2.

**Important UI behavior:**
- Schedule mode is mutually exclusive even though it is visually square: clicking `Schedule for later` or `Start now` updates a single `scheduleMode` value.
- Date accepts `YYYY-MM-DD`; the calendar table updates from the typed month/year when possible and includes previous/next month controls.
- Start time suggestions cover 24 hours in 15-minute intervals.
- Timezone suggestions are generated from real IANA timezone IDs where the browser supports `Intl.supportedValuesOf`; a small fallback list is used otherwise.
- The timezone datalist renders a small stable fallback list first, then loads the full runtime timezone list when the timezone field is focused/clicked to avoid server/client hydration mismatches.
- Checklist cards are intentionally omitted from the sidebars.
- Step 2 no longer displays large numbered section badges. It uses compact section headers and light dividers.
- Step 2 selection controls are visually square across visibility, join rule, and room permissions.
- Clicking a Step 2 selection tile updates the shared form state and the room summary where applicable.
- Single-language mode keeps one target language.
- Multi-language mode allows up to three target languages and excludes the source language from selectable targets.
- Supported languages are local typed config until a backend supported-languages endpoint exists.

**Backend integration:**
- The final `Create Room` action now builds `CreateTranslationRoomRequest` and calls `translationRoomService.create`, which maps to `POST /translationRooms`.
- Successful creation routes back to `/rooms?created={room.id}` and the created room is stored in the Module 1 demo cache by `translationRoomService`.

**Known limitations:**
- The date picker is a lightweight month table; it does not yet support multi-month range selection.
- Timezone values are display strings in the current form state; backend integration may prefer storing a normalized IANA timezone ID separately.
- Step 2 still uses local demo data for terminology files and generated room code preview.
- The backend create endpoint is used, but the backend room list endpoint is still missing, so `/rooms` reads created rooms from the local Module 1 demo cache until `GET /translationRooms` exists.

**Testing checklist:**
- [ ] `/rooms/create` renders Step 1 without a Checklist card.
- [ ] `Schedule for later` and `Start now` show as square selectable controls.
- [ ] Date can be typed manually.
- [ ] Clicking the date field opens the calendar table, month navigation works, and selecting a day updates the summary.
- [ ] Start time can be typed manually.
- [ ] Clicking the start time field opens the scrollable time picker.
- [ ] Timezone can be typed manually and selected from datalist suggestions.
- [ ] Continue to Room Setup still moves to Step 2.
- [ ] Step 2 renders as one minimal form surface rather than four numbered cards.
- [ ] `Who can join` uses square checked controls instead of circular radio inputs.
- [ ] `Permissions in room` uses square checked controls instead of circular radio-style markers.
- [ ] Visibility, join rule, and permissions tiles update their selected visual state when clicked.
