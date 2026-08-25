# Voice Profiles

Route: `/[workspaceSlug]/voice-profiles`.

The Voice Profiles page lists the current user's voice clone profiles in a dense Linear-style table with filters, search, display options, row selection actions, and an upload/record dialog for creating or replacing a profile sample.

## Current Behavior

- The table shows Name, Member, Health, Language, and Status columns.
- Display options can hide or show supported table properties without switching to a board layout.
- Clicking a profile name in the Name column opens the setup dialog with that profile's existing display name and language prefilled.
- Row selection still works from the checkbox or row surface; the name cell stops propagation so it can be used as the direct edit target.
- Workspace managers see an Assigned member select in the setup dialog. The closed select trigger renders only the selected member's display name, not the UUID value.
- Non-manager users see a read-only Assigned member field with only the display name.
- Saving a sample still uses the existing create/replace voice profile flow. There is no standalone frontend rename flow because the backend currently exposes create, list, delete, catalog, and preferred-voice endpoints, but no profile rename/update endpoint.

## Voice Consent

- WT-355 adds a required voice consent agreement to the setup dialog before an uploaded or recorded sample can be saved.
- The page keeps user-facing consent copy aligned with the agreed wording:
  - `Add voice profile`
  - `Set up voice profile`
  - `Agree & save voice profile`
- The setup dialog requires:
  - profile name
  - language
  - a valid audio sample
  - all five consent checkboxes
- The primary CTA stays disabled until the full form and consent state are complete.
- Multipart upload sends the five consent booleans with the sample payload.
- The page does not submit contract text; backend owns the canonical snapshot and hash.
- Consent status remains human-readable on the page while tolerating backend status values that follow the shared uppercase persistence convention such as `GRANTED`.

## Important UI Behavior

- Consent badges appear only for profiles with an attached sample.
- The page maps raw consent status values to labels:
  - `GRANTED` -> `Consent active`
  - everything else -> `Needs consent`
- The page accepts backend casing differences by normalizing before label mapping.

## Affected Files

- `src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx`
- `src/services/voice-profile.service.ts`
- `src/types/voice-profile.ts`
- `scripts/check-wt-355-voice-consent-contract.mjs`

## Testing Checklist

- Run `npm run test:wt-355-voice-consent`.
- Run `npm run typecheck`.
- Open `/[workspaceSlug]/voice-profiles`.
- Confirm toolbar action and empty-state action both read `Add voice profile`.
- Click a profile name in the Name column and verify the setup dialog opens with the profile name editable.
- Confirm Assigned member shows a human name in the closed trigger.
- Confirm the save CTA stays disabled until every consent checkbox is selected.
- Confirm a saved sampled profile shows `Consent active`.

## Notes For Future Maintainers

- `AGENTS.md` points to `/agents/...`, but this repo currently stores the docs under `.agents/...`.
- Keep user-facing consent labels separate from raw backend/database status casing.
- Keep the dense table UI as the source of truth for this page; WT-355 consent logic belongs inside the setup dialog, not as a replacement for the list layout.
