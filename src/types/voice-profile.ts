export interface VoiceProfileDto {
  id: string;
  displayName: string | null;
  language: string | null;
  status: string;
  isActive: boolean;
  hasSample: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoiceProfileRequest {
  displayName: string;
  language: string;
  sample?: File | null;
}
