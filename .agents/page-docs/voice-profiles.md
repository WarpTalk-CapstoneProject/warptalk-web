# Voice Profiles

## Route

- `/(app)/[workspaceSlug]/voice-profiles`

## What changed

- WT-355 adds a voice consent agreement to the profile setup dialog before an uploaded or recorded sample can be saved.
- The page now keeps user-facing consent copy aligned with the agreed wording:
  - `Add voice profile`
  - `Set up voice profile`
  - `Agree & save voice profile`
- Consent status badges remain human-readable on the page while tolerating backend status values that follow the shared uppercase persistence convention such as `GRANTED`.

## Why it changed

- Uploaded voice profiles need explicit, auditable consent before WarpTalk stores and reuses a personal sample for AI speech.
- The UI should stay readable for users instead of exposing raw database status strings.
- The page previously still showed `Create profile` in the empty state, which drifted from the WT-355 wording decision.

## Files affected

- `src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx`
- `src/services/voice-profile.service.ts`
- `src/types/voice-profile.ts`
- `scripts/check-wt-355-voice-consent-contract.mjs`

## Current behavior

- The toolbar and empty state both open the same setup flow using `Add voice profile`.
- The setup dialog requires:
  - profile name
  - language
  - a valid audio sample
  - all five consent checkboxes
- The primary CTA stays disabled until the full form and consent state are complete.
- Save success uses `Voice profile saved`.
- Backend validation errors are surfaced through the existing API error helper when available.

## Important UI behavior

- Consent badges appear only for profiles with an attached sample.
- The page maps raw consent status values to labels:
  - `GRANTED` -> `Consent active`
  - everything else -> `Needs consent`
- The page accepts backend casing differences by normalizing before label mapping.

## Important logic

- Multipart upload sends the five consent booleans with the sample payload.
- The page does not submit contract text; backend owns the canonical snapshot and hash.
- Sample quality is still checked before save.

## Known limitations

- The page only renders `Consent active` and `Needs consent` right now.
- Library voice preview work is tracked separately and is not part of this page doc update.

## Testing checklist

- Run `npm run test:wt-355-voice-consent`
- Open `/voice-profiles`
- Confirm toolbar action and empty-state action both read `Add voice profile`
- Confirm the save CTA stays disabled until every consent checkbox is selected
- Confirm a saved sampled profile shows `Consent active`

## Notes for future maintainers

- `AGENTS.md` points to `/agents/...`, but this repo currently stores the docs under `.agents/...`.
- Keep user-facing consent labels separate from raw backend/database status casing.
