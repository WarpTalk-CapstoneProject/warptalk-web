# Voice Profiles Page Documentation

State, changes and logic for the Voice Profiles page.

## Current Route

- Route: `/[workspaceSlug]/voice-profiles`
- Page: `src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx`
- List column: `src/components/voice/voice-profile-list.tsx` ("Your voices"),
  `src/components/voice/library-voice-list.tsx` (library rows + "Stand-in voice")
- Rail: `src/components/voice/my-dub-voice-picker.tsx` ("You are dubbed in")
- Buttons: `src/components/voice/voice-sample-button.tsx` (the ORIGINAL),
  `src/components/voice/voice-preview-button.tsx` (the CLONE)
- Shared playback: `src/hooks/use-audio-playback.ts`

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

## Why the playback lifecycle is a hook

`use-audio-playback.ts` holds the object-URL lifecycle for both buttons. An object URL is a live
handle into the document rather than a value: leaving one behind on every press keeps the whole
blob alive for the life of the page. Two buttons that play audio is exactly when that gets copied
and then diverges.

What it deliberately does **not** own is the error message. A preview can fail because a provider
is busy; a stored recording cannot. The hook hands the error back and each button says its own
sentence.

## Known limitations

- The Cartesia catalogue only warms after a real meeting's first synthesis for a language, so on a
  fresh environment "Stand-in voice" resolves names from the profile's own `displayName` rather
  than the catalogue. That is the designed cold path, not a failure.
- There is no waveform or duration shown for the original, so a very short recording is only
  discoverable by playing it.

## Testing checklist

- [x] `npm run lint`, `npm run typecheck`, `npm run test:contracts`.
- [x] Owner fetches their own sample → 200 with the uploaded bytes and the right content type.
- [x] Another account fetches the same profile → 404.
- [ ] Upload a recording, press play on the "Your voices" row → you hear **yourself**.
- [ ] Press play under "Stand-in voice" → you hear the **clone** of you.
- [ ] Press play while the clone is still building → the original still plays.

## Notes for future maintainers

If you find yourself making both rows use the same button "for consistency", read the table at the
top first. The inconsistency is the feature.
