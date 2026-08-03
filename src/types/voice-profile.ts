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
}

export interface CreateVoiceProfileRequest {
  displayName: string;
  language: string;
  sample?: File | null;
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
