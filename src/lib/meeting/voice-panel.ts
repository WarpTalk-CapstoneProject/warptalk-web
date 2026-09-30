/**
 * Which sections the Voice panel shows, and what they are called, for the surface rendering it.
 *
 * ONE PANEL, TWO SURFACES
 *   The panel was written for the meeting control bar and lived inside it. An EXTERNAL_BRIDGE room
 *   needs the same choices — how you sound, and what you hear the other side in — but it renders
 *   them somewhere else (the popup that floats over Google Meet), and three of the control bar's
 *   rules are wrong there. Rather than copy the panel and let the copies drift, the one component
 *   takes a `mode`, and every difference between the two modes is decided here, where it can be
 *   tested without React.
 *
 * WHAT IS DIFFERENT IN A BRIDGE ROOM, AND WHY
 *
 *   1. No Voice switch. Hearing the far side's translation is a button on the popup's own dock
 *      ("Voice + Text / Text only", the names /join uses). A second switch here would be two
 *      controls for one boolean, which is how they come to disagree.
 *
 *   2. "Your voice" is never hidden. In the control bar it sits behind `voiceEnabled`, but that flag
 *      only decides what THIS person hears — it never leaves the browser (sessionStorage and
 *      FilteredRoomAudio are its only readers). In a bridge room the host's dub is the outbound leg
 *      and is always sent (see room-audio-routing.ts), so "Your voice" is what the people in Meet
 *      hear whatever the dock says. Hiding it behind Text only, which is the bridge default, would
 *      hide the one voice choice that matters there.
 *
 *   3. "Their voice", not "Stand-in voice". In a bridge room the stand-in is a SEAT — the far side
 *      of the Meet call — so the control bar's word collides with it. The section is still the
 *      voice you hear other people in, which in a bridge room is exactly one party: them. Its
 *      caveat ("only applies to people who have not chosen a voice of their own") is dropped
 *      because it is always true there — the far side never clones and never picks a voice.
 *      It is shown only while the host is hearing their translation, as the control bar does.
 *
 *   4. The closing sentence describes how you sound, never "you read translations instead". That
 *      branch of describeVoiceSelection reports the switch, and there is no switch here.
 *
 *   5. Picking "Their voice" leaves your clone consent alone. The control bar withdraws it on the
 *      same click (see `pickWithdrawsConsent`), which in a bridge room would stop the people in
 *      Meet hearing the host's own voice the moment the host chose how to hear them.
 *
 * The meeting mode reproduces the control bar exactly as it has always rendered and behaved: this
 * module was introduced to let a second surface reuse the panel, not to change the first one.
 */

export type VoicePanelMode = "meeting" | "bridge";

export type VoicePanelInput = {
  mode: VoicePanelMode;
  /** false = transcript only for this listener. Undefined means the host never said. */
  voiceEnabled?: boolean;
  /** Whether the host passed a handler for each control. A control with no handler is not shown. */
  canToggleVoice: boolean;
  canPickDubVoice: boolean;
  canConsentClone: boolean;
};

export type VoicePanelPlan = {
  /** The on/off switch for hearing translated voice, or null when this surface has none. */
  voiceSwitch: { label: string; detail: string; ariaLabel: string } | null;
  /** The "how you sound" section: My voice, your own profiles, and the library. */
  yourVoice: { heading: string; note: string | null } | null;
  /**
   * The "what you hear others in" section: Automatic plus the catalog. `heading` is null where the
   * control bar historically printed the list without one (no "Your voice" section above it).
   *
   * `pickWithdrawsConsent` is the control bar's rule that choosing a voice here also turns your
   * own clone consent off, and that no row reads as selected while consent is on. It predates the
   * split into "Your voice" and this list, and it is kept in the meeting mode untouched. In a bridge
   * room it would be actively harmful: this list is the voice of the far side, who can never be
   * cloned, and withdrawing the host's consent on the way would silently switch what the people in
   * Meet hear from the host's own voice to a stock one. See tts_worker _resolve_voice_variants:
   * a listener's pick only ever replaces a speaker who has no voice of their own.
   */
  listenVoice: {
    heading: { title: string; note: string | null } | null;
    automaticDetail: string;
    pickWithdrawsConsent: boolean;
  } | null;
  /** Whether a divider separates the switch from the sections below it. */
  dividerAfterSwitch: boolean;
  /** Whether the closing sentence may report transcript-only — only where the switch is on screen. */
  summaryReadsVoiceEnabled: boolean;
};

export function planVoicePanel({
  mode,
  voiceEnabled,
  canToggleVoice,
  canPickDubVoice,
  canConsentClone,
}: VoicePanelInput): VoicePanelPlan {
  const hasYourVoiceControls = canPickDubVoice || canConsentClone;

  if (mode === "bridge") {
    // Hearing is opt-in there, and the dock's default is Text only, so only an explicit true shows
    // the voices that change what the host hears.
    const hearing = voiceEnabled === true;
    return {
      voiceSwitch: null,
      yourVoice: hasYourVoiceControls
        ? { heading: "Your voice", note: "What they hear in Meet." }
        : null,
      listenVoice: hearing
        ? {
            heading: { title: "Their voice", note: "The voice you hear them in." },
            automaticDetail: "Assigned, not matched to their voice",
            pickWithdrawsConsent: false,
          }
        : null,
      dividerAfterSwitch: false,
      summaryReadsVoiceEnabled: false,
    };
  }

  // Meeting: the control bar as it has always been. Undefined counts as on, which is what the
  // bar's `voiceEnabled !== false` tests have always meant.
  const hearing = voiceEnabled !== false;
  return {
    voiceSwitch: canToggleVoice
      ? {
          label: "Voice",
          detail: hearing
            ? "On — translations are spoken to you."
            : "Off — you read translations instead of hearing them.",
          ariaLabel: "Hear translated voice",
        }
      : null,
    yourVoice: hearing && hasYourVoiceControls ? { heading: "Your voice", note: null } : null,
    listenVoice: hearing
      ? {
          heading: hasYourVoiceControls
            ? {
                title: "Stand-in voice",
                note: "Only applies to people who have not chosen a voice of their own.",
              }
            : null,
          automaticDetail: "Assigned, not matched to your voice",
          pickWithdrawsConsent: true,
        }
      : null,
    dividerAfterSwitch: hearing,
    summaryReadsVoiceEnabled: true,
  };
}
