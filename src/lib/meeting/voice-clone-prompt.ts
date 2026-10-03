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

/**
 * What picking "My voice" in the Google Meet popup does.
 *
 * Bridge room 01a1010c, 3 Oct 2026: the host picked "My voice" in the popup and was never dubbed in
 * it. The pick is two gates (see handleAllowVoiceCloneFromPrompt): the room switch is refused (403)
 * without the account-level consent, and the popup only ever sent the room switch. The refusal was
 * a toast in the main window, which nobody looks at during a Meet call.
 *
 * `accountConsent` undefined means the status has not loaded: the pick is sent, and the server
 * decides. Turning it off never asks.
 */
export function planOwnVoicePick(input: {
  enabling: boolean;
  accountConsent: boolean | undefined;
}): "send" | "ask" {
  if (!input.enabling) return "send";
  return input.accountConsent === false ? "ask" : "send";
}

/** How long the main window gets to report the pick before the popup calls it lost. */
export const OWN_VOICE_PICK_TIMEOUT_MS = 6_000;

/**
 * Whether a "My voice" pick sent from the popup took, judged from what the main window reports.
 *
 * The main window turns its switch on at once and takes it back when the server refuses, so a
 * refusal reads as on-then-off. A pick that never showed up at all (no main window, an older one
 * that drops the intent) is lost after OWN_VOICE_PICK_TIMEOUT_MS.
 */
export function judgeOwnVoicePick(input: {
  requestedAtMs: number;
  nowMs: number;
  /** The snapshot has reported the switch on at least once since the pick. */
  sawEnabled: boolean;
  /** What the snapshot reports now. */
  enabled: boolean;
}): "pending" | "on" | "failed" {
  const elapsed = input.nowMs - input.requestedAtMs;
  if (input.enabled) return elapsed >= OWN_VOICE_PICK_TIMEOUT_MS ? "on" : "pending";
  if (input.sawEnabled) return "failed";
  return elapsed >= OWN_VOICE_PICK_TIMEOUT_MS ? "failed" : "pending";
}
