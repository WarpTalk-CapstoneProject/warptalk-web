/**
 * When to ask, inside a meeting, whether this person wants to be dubbed in their own voice.
 *
 * Production room 01a100d8, 3 Oct 2026: the host spoke for six minutes dubbed in a library voice
 * because their clone was `not_opted_in`, and the only place that said so was a status line in the
 * voice panel. They found the switch at 15:25 by themselves. The owner asked for a small prompt
 * instead of a setting somebody has to know about.
 *
 * KEYED ON WHAT THE PIPELINE SAYS, NOT ON A GUESS FROM THE BROWSER. `not_opted_in` is the TTS
 * worker's own verdict for THIS speaker on a route that exists, so it arrives only when it matters
 * (translation is running and they are talking) and it is right whichever of the two gates is the
 * one that is closed — the account-level consent, or the per-meeting choice. The browser cannot
 * know the second: the in-meeting switch is local state that resets on every rejoin.
 */
export type VoiceClonePromptInput = {
  /** The latest VoiceCloneStateChanged reason for this participant, if any. */
  cloneReason: string | null | undefined;
  /** A voice the person picked to be dubbed in. With one, cloning is not what they hear. */
  dubVoiceId: string | null | undefined;
  /** "Not now" was pressed in this meeting. */
  dismissed: boolean;
};

export function shouldPromptVoiceClone(input: VoiceClonePromptInput): boolean {
  if (input.dismissed) return false;
  if (input.dubVoiceId) return false;
  return input.cloneReason === "not_opted_in";
}

/** Per meeting, so "not now" holds through a reload but is asked again next meeting. */
export function voiceClonePromptDismissKey(roomId: string): string {
  return `warptalk.voiceClonePrompt.dismissed.${roomId}`;
}
