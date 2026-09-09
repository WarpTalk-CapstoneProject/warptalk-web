# Voice Profiles Page Documentation

State, changes and logic for the Voice Profiles page. Created under WT-649, which was the first
change to touch this page after the documentation rule came in — there was no doc for it before.

**This file is written identically on two branches** — the WT-649 client fixes and the
hear-your-own-recording feature — because both touch this page and the repository rule asks each
of them to document it. Identical bytes add cleanly whichever merges first. If you edit it on one
branch while the other is open, copy the edit across rather than letting them drift.

## Current Route

- Route: `/[workspaceSlug]/voice-profiles`
- Page: `src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx`
- List column: `src/components/voice/voice-profile-list.tsx` ("Your voices"),
  `src/components/voice/library-voice-list.tsx` (library rows + "Stand-in voice")
- Rail: `src/components/voice/my-dub-voice-picker.tsx` ("You are dubbed in")
- Buttons: `src/components/voice/voice-sample-button.tsx` (the ORIGINAL),
  `src/components/voice/voice-preview-button.tsx` (the CLONE)
- Shared playback: `src/hooks/use-audio-playback.ts`
- Preview failure copy: `src/lib/voice/preview-error.ts`

## The two play buttons, and why there are two

This is the thing to understand before changing anything on this page.

| Where | Plays | Answers |
|---|---|---|
| **Your voices** | the recording you uploaded | "what did I record?" |
| **Stand-in voice** / **You are dubbed in** | the clone speaking a fixed sentence | "how do I sound to other people?" |

Both used to play the **clone**. That meant the recording somebody uploaded was not audible
anywhere in the product, and the question they actually have — *is this a good clone of me?* — had
no way to be answered. It is a question about the **distance between two sounds**, and only one of
them was ever played.

`scripts/check-voice-preview-contract.mjs` asserts this split in both directions: the profile list
must render `VoiceSampleButton`, and must **not** render `VoicePreviewButton`. Putting the clone
back on that row is the regression, not a tidy-up.

## Hearing the original

`GET /auth/voice-profiles/{profileId}/sample` streams the stored upload back.
`VoiceProfileService.sample(profileId)` calls it; `VoiceSampleButton` plays it.

**The button appears on `hasSample`, not `providerVoiceId`.** The recording exists from the moment
of upload and does not wait for the clone, which is exactly when somebody wants to check what they
recorded — including when the clone is still running, or has failed.

**Access.** These bytes are a recording of a person's voice, kept because they agreed to have it
cloned, not because they agreed to publish it. The endpoint is owner-only, and somebody else's
profile answers **404 rather than 403** — "that exists but is not yours" is how a list of profile
ids gets walked until the real ones answer differently. A deleted profile stops answering for its
owner too, and a sample whose audio was reduced to an embedding (`contains_raw_audio` false) is
never read from storage.

The same care applies off the page: the local stack writes these uploads under
`auth/src/WarpTalk.AuthService.API/uploads/`, and `.gitignore` keeps that path out of the
repository. They are somebody's biometric data, not fixtures.

## Why the playback lifecycle is a hook

`use-audio-playback.ts` holds the object-URL lifecycle for both buttons. An object URL is a live
handle into the document rather than a value: leaving one behind on every press keeps the whole
blob alive for the life of the page. Two buttons that play audio is exactly when that gets copied
and then diverges.

What it deliberately does **not** own is the error message. A preview can fail because a provider
is busy; a stored recording cannot. The hook hands the error back and each button says its own
sentence.

## How the page gets its names

Three sources, and they do not all always answer:

1. **The provider catalogue** — `useVoiceCatalog(language)` → `GET /auth/voice-profiles/catalog`.
   Carries `{ id, name, gender }` and is the nicest name available ("Linh - Soft Presence"). It is
   backed by a 6-hour Redis cache the AI worker fills, so it is **empty until that worker's first
   synthesis for the language**, and empty for the whole first paint while the query is in flight.
2. **The profile's own `displayName`** — from `GET /auth/voice-profiles`, captured when the pick
   was made, which is the one moment the catalogue was guaranteed warm.
3. **Nothing.** Both of the above can be absent at once, and this is normal, not an error state.

**Never the id.** A provider voice id is a UUID; rendering one as a name is what WT-649 reported.

`describeSavedVoice` in `src/lib/voice/voice-preference.ts` is where this lives, and it returns a
**state** rather than a string — `named`, `loading`, `unavailable`, `automatic`. That distinction
is not cosmetic: `resolveSavedVoiceForLanguage` drops an id the catalogue does not currently offer
instead of sending it, so the moment a name cannot be resolved is the moment the preference is not
actually in effect. The rail says so, and hides the preview button, because
`IsVoiceChoosableByAsync` would refuse an id the catalogue does not carry.

`"Automatic"` is reserved for no preference at all. Using it as a loading placeholder would put a
contradiction on screen beside the Remove control.

That work landed separately, on the branch that also renamed the rail from "Voices you hear" — a
title that promised a listener a veto over how everyone sounds, which the product does not do. A
speaker who cloned or picked a voice is always heard as themselves.

## The preview error said one thing and meant another

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

- The Cartesia catalogue only warms after a real meeting's first synthesis for a language, so on a
  fresh environment the rail resolves names from the profile's own `displayName` rather than the
  catalogue. That is the designed cold path, not a failure.
- Profile rows written before the API stored a name keep `display_name = NULL`. They are carried by
  the client-side fallback above; a backfill is not part of this change.
- `GET /auth/voice-profiles/dub-voice` returns `{ voiceId }` with no name field at all, so the dub
  picker depends entirely on matching that id against the profiles or the catalogue.
- There is no waveform or duration shown for the original, so a very short recording is only
  discoverable by playing it.

## Testing checklist

- [x] `npm run lint`, `npm run typecheck`, `npm run test:contracts`.
- [x] `npm run test:preview-error` — the code→copy map, including the unknown-code fallback.
- [x] Owner fetches their own sample → 200 with the uploaded bytes and the right content type.
- [x] Another account fetches the same profile → 404.
- [ ] Upload a recording, press play on the "Your voices" row → you hear **yourself**.
- [ ] Press play under "Stand-in voice" → you hear the **clone** of you.
- [ ] Press play while the clone is still building → the original still plays.
- [ ] Stop the TTS worker and press preview: the message matches a dependency being unavailable.
- [ ] Open the page for a language the worker has not warmed: a neutral phrase, never an id.

## Notes for future maintainers

If you find yourself making both rows use the same button "for consistency", read the table at the
top first. The inconsistency is the feature.

If you add a branch to the preview endpoint, give it an error code that describes the **cause**,
and add the copy to `PREVIEW_MESSAGE_BY_CODE`. The failure WT-649 was about was not a missing
message — it was a code and a message that described different things, with no test holding them
together.
