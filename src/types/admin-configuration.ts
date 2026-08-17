/**
 * Contracts for the system-admin Configuration screen.
 *
 * Two read-only surfaces: the language catalog room validation actually reads
 * (`~/api/v1/admin/languages`, translation-room) and where voice-clone consent stands in
 * aggregate (`~/api/v1/admin/voice-consent/summary`, auth).
 */

/** A row of `translation_room.supported_languages` — the table the validator queries. */
export interface AdminSupportedLanguageDto {
  code: string;
  name: string;
  nativeName: string | null;
  /** Inactive rows are included: present-and-off is a different fix from absent. */
  isActive: boolean;
}

export interface AdminVoiceConsentStatusCountDto {
  consentType: string;
  status: string;
  /** People, not rows — the newest decision per person. */
  people: number;
}

export interface AdminVoiceConsentVersionCountDto {
  textVersion: string;
  people: number;
}

export interface AdminVoiceConsentSummaryDto {
  byStatus: AdminVoiceConsentStatusCountDto[];
  /** Only people whose CURRENT decision is a grant, grouped by the wording they agreed to. */
  currentGrantsByTextVersion: AdminVoiceConsentVersionCountDto[];
  /** Rows in the append-only table: the length of the audit trail, not a headcount. */
  totalDecisions: number;
  /** What new consent is collected against, so the client need not hardcode the string. */
  currentTextVersion: string;
}
