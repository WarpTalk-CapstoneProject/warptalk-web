/**
 * Which voice the other side will ACTUALLY hear.
 *
 * WHY THIS EXISTS
 *   The meeting bar carried two controls — "Voice" and "Voice Clone" — for what is one decision:
 *   whose voice the dub is spoken in. Underneath they were not even two switches but three, in
 *   two services: account-level biometric consent, an account preference, and the per-route flag
 *   the worker actually reads.
 *
 *   On 15 Aug the whole team tried to hear a cloned voice and could not, and reported the menu as
 *   the problem: "2 cái này thao tác khó quá? sao k gom lúc chọn voice clone thì có option lun là
 *   my voice í". They were right about the fix. They were also, the whole time, listening to the
 *   default voice with no way to tell — the worker was logging voice_clone_sample_accepted with
 *   score 1.0 into a log nobody in a meeting can read.
 *
 * SO THE ANSWER IS A SENTENCE, NOT A SWITCH POSITION
 *   Every field below is something the client already holds. The value of putting them together
 *   is that "your own voice" and "a stand-in, because nobody needs a translation of you" stop
 *   looking identical from the outside.
 */

import type { VoiceOptionDto } from "@/types/realtime";

export type VoiceSelectionInput = {
  /** false = this listener wants transcript only and no audio is synthesized at all. */
  voiceEnabled?: boolean;
  /** Whether this participant has consented to have their own voice cloned. */
  voiceCloneEnabled?: boolean;
  /**
   * The voice this participant is DUBBED IN, or null to be cloned live in the meeting.
   *
   * This used to read `voicePreference` — the voice you HEAR OTHER PEOPLE in — and describe it
   * as "listeners hear your translated speech in X". That was the wrong direction, so the
   * collapsed row told a speaker how they sounded based on a setting that has never affected
   * how they sound. The two are now separate controls in the meeting panel, and this is the one
   * that answers the question this module asks.
   */
  dubVoice?: string | null;
  /** Voices offered for the current language. */
  voiceCatalog?: VoiceOptionDto[];
  /** This participant's own uploaded profiles, so a voice of theirs can be named rather than
   *  reported as "Unavailable" merely because it is not in the public catalogue. */
  ownVoiceProfiles?: { name: string; voiceId: string }[];
  /**
   * Whether anybody is listening in a language other than this participant's own.
   *
   * False means no route out of them exists, so NOTHING they choose here changes what anyone
   * hears — see lib/meeting/dub-audience.ts. Saying so is the difference between "the clone is
   * broken" and "there is nobody to clone for", which is the conclusion the team reached the hard
   * way.
   */
  hasAudience?: boolean;
};

export type VoiceSelection = {
  kind: "transcript-only" | "cloned" | "picked" | "automatic";
  /** Short label for the collapsed settings row. */
  label: string;
  /** One line under it, saying what that actually means for listeners. */
  detail: string;
  /** True when the choice currently changes nothing, because nobody needs a translation. */
  inert: boolean;
};

export function describeVoiceSelection(input: VoiceSelectionInput): VoiceSelection {
  const {
    voiceEnabled,
    voiceCloneEnabled,
    dubVoice,
    voiceCatalog,
    ownVoiceProfiles,
    hasAudience = true,
  } = input;

  // Checked first and independently of everything below: transcript-only is about what THIS
  // person receives, and it holds whether or not anybody is being dubbed in their direction.
  if (voiceEnabled === false) {
    return {
      kind: "transcript-only",
      label: "Transcript only",
      detail: "You read translations instead of hearing them.",
      inert: false,
    };
  }

  // `inert` rather than a different kind: the choice is real and stored, it simply has no
  // listener today. Reporting it as "off" would be the same lie in the other direction.
  const inert = !hasAudience;
  const audienceNote = inert
    ? " Nobody is listening in another language right now, so nothing is being dubbed."
    : "";

  // Checked BEFORE the clone, because that is the order the worker resolves them in: a voice
  // this person deliberately picked wins over one cloned live, and reporting the clone while the
  // pipeline uses the pick would be the same lie this module exists to stop telling.
  // See TTSWorker._resolve_voice_variants.
  if (dubVoice) {
    const mine = ownVoiceProfiles?.find((profile) => profile.voiceId === dubVoice);
    const fromCatalog = voiceCatalog?.find((voice) => voice.id === dubVoice);
    const named = mine?.name ?? fromCatalog?.name;
    return {
      kind: "picked",
      // A voice no longer offered for this language is not a bug worth hiding — the language
      // changed under it. Say so rather than reading as "Automatic", which is what the row did
      // before.
      label: named ?? "Unavailable voice",
      detail: named
        ? `Listeners hear your translated speech in ${named}.${audienceNote}`
        : "That voice is not offered for this language. Pick another one.",
      inert,
    };
  }

  if (voiceCloneEnabled) {
    return {
      kind: "cloned",
      label: "My voice",
      detail: `Listeners hear your translated speech in your own voice.${audienceNote}`,
      inert,
    };
  }

  return {
    kind: "automatic",
    label: "Automatic",
    // "Assigned, not matched" is the honest description: the worker picks deterministically from
    // the catalog by hashing the speaker id, so everyone keeps a stable voice and no two people
    // sound alike — but nothing compares it to how the speaker actually sounds.
    detail: `A stand-in voice, assigned rather than matched to how you sound.${audienceNote}`,
    inert,
  };
}
