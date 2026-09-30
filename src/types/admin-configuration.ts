/**
 * Contracts for the system-admin Configuration screen.
 *
 * Two surfaces: the language catalog room validation actually reads
 * (`~/api/v1/admin/languages`, translation-room — manageable since WT-691, every change audited)
 * and where voice-clone consent stands in aggregate (`~/api/v1/admin/voice-consent/summary`,
 * auth, read-only).
 */

/** A row of `translation_room.supported_languages` — the table the validator queries. */
export interface AdminSupportedLanguageDto {
  code: string;
  name: string;
  nativeName: string | null;
  /** Inactive rows are included: present-and-off is a different fix from absent. */
  isActive: boolean;
  /**
   * WT-691: rooms IN_PROGRESS, PAUSED or WAITING whose source or target is this language. A
   * language a live meeting uses cannot be disabled. Absent from a backend that predates WT-691.
   */
  liveMeetings?: number;
  /** WT-691: SCHEDULED rooms in this language. Disabling it then needs an explicit confirmation. */
  upcomingMeetings?: number;
}

/** `POST /admin/languages`. The server normalises the code ("ko_kr" → "ko-KR"). */
export interface AdminCreateLanguageRequest {
  code: string;
  name: string;
  nativeName?: string | null;
  isActive?: boolean;
}

/** `PUT /admin/languages/{code}`. The code is the key and never changes. */
export interface AdminUpdateLanguageRequest {
  name: string;
  nativeName?: string | null;
}

/** `POST /admin/languages/{code}/disable`. */
export interface AdminDisableLanguageRequest {
  /** Required when scheduled meetings still use the language; the server 409s without it. */
  confirmUpcoming?: boolean;
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
