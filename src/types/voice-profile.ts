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
  ownVoiceConfirmed: boolean;
  aiUseConfirmed: boolean;
  syntheticVoiceAcknowledged: boolean;
  noImpersonationConfirmed: boolean;
  retentionAcknowledged: boolean;
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
