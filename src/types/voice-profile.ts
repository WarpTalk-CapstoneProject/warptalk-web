export interface VoiceProfileDto {
  id: string;
  displayName: string | null;
  language: string | null;
  status: string;
  isActive: boolean;
  hasSample: boolean;
  createdAt: string;
  updatedAt: string;
  /** "cartesia" for a picked library voice. Null on older sample-upload profiles. */
  provider?: string | null;
  /**
   * The provider's own id for the voice — for a picked library voice this is the Cartesia
   * voice id, which is exactly what TranslationRoomHub.SetVoicePreference expects.
   */
  providerVoiceId?: string | null;
  consentStatus?: string | null;
  consentTextVersion?: string | null;
  consentGrantedAt?: string | null;
}

export interface CreateVoiceProfileRequest {
  displayName: string;
  language: string;
  sample?: File | null;
  ownVoiceConfirmed?: boolean;
  aiUseConfirmed?: boolean;
  syntheticVoiceAcknowledged?: boolean;
  noImpersonationConfirmed?: boolean;
  retentionAcknowledged?: boolean;
}

/** One selectable voice from the provider's public library. */
export interface VoiceCatalogItemDto {
  id: string;
  name: string;
  gender: string;
}

/** voiceId null clears the preference, back to the automatic per-speaker default. */
export interface SetPreferredVoiceRequest {
  language: string;
  voiceId: string | null;
}

/**
 * WT-396 — pick, or clear, the voice this user is DUBBED IN.
 *
 * The opposite direction from SetPreferredVoiceRequest above. That one says which voice you HEAR
 * everybody else in; this one says how YOU sound to them. They were the same stored concept, so
 * a recording someone uploaded of themselves changed neither, and the dub came back in a stock
 * voice while the UI showed the profile as active.
 *
 * voiceId null clears the choice and goes back to cloning the speaker live from the meeting.
 * language is only needed to validate a pick from the public catalogue — a voice that belongs to
 * one of your own profiles is accepted without it.
 */
export interface SetDubVoiceRequest {
  voiceId: string | null;
  language?: string | null;
}

/**
 * Ask to hear one voice speaking one sentence.
 *
 * Both fields are required, unlike SetDubVoiceRequest above where the language is only needed
 * to validate a catalogue pick. Here the language decides what the voice SAYS, so there is no
 * sensible default to fall back to.
 */
export interface PreviewVoiceRequest {
  voiceId: string;
  language: string;
}

/**
 * What this person has decided about having their voice cloned.
 *
 * `hasDecided` is separate from `isGranted` deliberately: "never been asked" and "asked and said
 * no" are the same false to a boolean and completely different on screen — one should show the
 * request, the other must not nag somebody who already declined.
 */
export interface VoiceConsentStatusDto {
  hasDecided: boolean;
  isGranted: boolean;
  status: string | null;
  consentTextVersion: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
}
