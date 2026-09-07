# Voice Profiles Page Documentation

State, changes and logic for the Voice Profiles page. Created under WT-649, which was the first
change to touch this page after the documentation rule came in — there was no doc for it before.

## Current Route

- Route: `/[workspaceSlug]/voice-profiles`
- Source: `src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx`
- Rail modules: `src/components/voice/my-dub-voice-picker.tsx` ("You are dubbed in"),
  `src/components/voice/library-voice-list.tsx` (the library rows and "Voices you hear")
- Preview button: `src/components/voice/voice-preview-button.tsx`
- Data hooks: `src/hooks/use-voice-profiles.ts`
- Types: `src/types/voice-profile.ts`

## How the page gets its names

Three sources, and they do not all always answer:

1. **The provider catalogue** — `useVoiceCatalog(language)` → `GET /auth/voice-profiles/catalog`.
   Carries `{ id, name, gender }` and is the nicest name available ("Linh - Soft Presence"). It is
   backed by a 6-hour Redis cache the AI worker fills, so it is **empty until that worker's first
   synthesis for the language**, and it is empty for the whole first paint while the query is in
   flight.
2. **The profile's own `displayName`** — from `GET /auth/voice-profiles`. Set for uploads and for
   in-meeting clones. For a library pick it was `null` until WT-649 fixed the API to store the
   catalogue name at the moment the pick is validated.
3. **Nothing.** Both of the above can be absent at once, and this is normal, not an error state.

**Resolution order, and the rule:** catalogue name → profile `displayName` → a neutral phrase.
**Never the id.** A provider voice id is a UUID; rendering it as a name is what WT-649 reported.

## WT-649 — the UUID, and the preview error

### "Voices you hear" showed a raw UUID

`usePreferredVoiceId` found a whole `VoiceProfileDto` and returned only its `providerVoiceId`,
throwing away the `displayName` on the same object. `ListeningVoiceSummary` then ended its lookup
with `?? currentVoiceId`, so a catalogue miss printed the UUID. Because `catalog` defaults to `[]`
while loading, that happened on **every** first paint, not only on stale data.

Now: the hook is `usePreferredVoice` and returns the profile. The label falls back through the
order above, shows `…` while the catalogue query is pending, and says "A voice you picked" when
nothing names it.

`"Automatic"` is reserved for `currentVoiceId === null`. It means *no preference is set*, and the
Preview and Remove controls render precisely when one **is** — so using it as a loading placeholder
would put a contradiction on screen.

`my-dub-voice-picker.tsx` had the same `return chosen` fallback into `<SelectValue>` and got the
same treatment.

### The preview error said one thing and meant another

The endpoint answers `{ error, code }`, and the button read only `error`. The server's
render-timeout branch carried `INVALID_STATE` — "the thing you asked about is in a state that
cannot do this" — beside a message that correctly described a slow render. The two disagreed, and
QA read the code rather than the message.

The API side is fixed separately: that branch, and the unreachable-queue branch above it, now
answer `SERVICE_UNAVAILABLE`. Nothing on that path ever read `VoiceProfile.Status`; the only way to
reach it is the render not arriving inside the worker's 12-second window.

The client half is `src/lib/voice/preview-error.ts` — a code→copy map, following the
`REJECTION_ADVICE` precedent in `src/lib/meeting/clone-capture-state.ts`.

**An unrecognised code deliberately keeps the server's own message.** This is load-bearing for
deploy order: the web can ship before the API, and the old API still sends `INVALID_STATE` with the
honest sentence beside it. Collapsing unknown codes to generic copy would delete that sentence and
make the reported defect worse until the backend caught up.

The Blob-unwrapping path stays. `responseType: "blob"` applies to failure responses too, so the
JSON body arrives as a Blob and has to be read back as text before it says anything.

## Known limitations

- Voice profile rows written **before** this change keep `display_name = NULL` in the database. The
  API fix only covers rows written from now on; those older rows are carried by the client-side
  fallback above. A backfill is not part of this change.
- The catalogue name is resolved at read time from a cache that can be cold, so a voice can show
  "A voice you picked" on a language the TTS worker has not warmed yet. That is honest, but it is
  less useful than a name.
- `GET /auth/voice-profiles/dub-voice` returns `{ voiceId }` with no name field at all, so the dub
  picker depends entirely on matching that id against the profiles or the catalogue.

## Testing checklist

- [x] `npm run test:preview-error` — the code→copy map, including the unknown-code fallback.
- [x] `npm run test:voice-preview` — the existing wiring contract.
- [x] `npm run lint`, `npm run typecheck` — no findings in the touched files.
- [ ] Pick a library voice, reload: "Voices you hear" shows the catalogue name, and shows no UUID
      at any point during the first paint.
- [ ] Stop the TTS worker and press preview: the message matches a dependency being unavailable.
- [ ] Open the page for a language the worker has not warmed: a neutral phrase, never an id.

## Notes for future maintainers

If you add a branch to the preview endpoint, give it an error code that describes the **cause**,
and add the copy to `PREVIEW_MESSAGE_BY_CODE`. The failure this ticket was about was not a missing
message — it was a code and a message that described different things, with no test holding them
together.
