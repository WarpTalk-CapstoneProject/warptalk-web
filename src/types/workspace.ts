export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  role: string;
  membershipType?: string | null;
  canApproveDocuments?: boolean;
  createdAt: string;
  defaultLanguage?: string;
}

export interface InitialWorkspaceInvitation {
  email: string;
  roleName: string;
  membershipType: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  logoUrl?: string | null;
  verifiedDomains?: string[];
  requireVerifiedDomainForInternal?: boolean;
  initialInvitations?: InitialWorkspaceInvitation[];
}

export interface VerifiedDomainDto {
  id: string;
  domain: string;
  status: string;
  /**
   * What backs this claim: `owner_email` (matches the claiming account's own address, so the
   * account is the evidence) or `self_asserted` (any other domain, recorded with the owner's
   * consent since nothing else can attest to it). `dns_txt` is reserved for real verification.
   */
  verificationMethod: string;
  verificationToken?: string | null;
  createdAt: string;
  verifiedAt?: string | null;
}

/**
 * Spelled exactly as the backend enumerates them (WorkspaceConstants), because the settings
 * document is read, modified and written back whole — the value this client sends is the value it
 * was given. The server compares ordinally and rejects anything else rather than rounding it to
 * the nearest supported value, so "internal" is a validation error here, not a synonym.
 */
export type MinutesClassification = "Internal" | "Confidential" | "Public";

/** `vn-nd30` = Nghị định 30/2020 conventions; `global-en` = A4 / 25.4mm / sans 11pt / decimal clauses. */
export type MinutesTemplate = "vn-nd30" | "global-en";

export interface WorkspaceSettingsDto {
  defaultLanguage: string;
  timezone: string;
  allowedTargetLanguages: string[];
  voiceCloningEnabled: boolean;
  maxActiveRooms: number;
  /**
   * The most concurrent rooms this workspace's PLAN permits, whatever `maxActiveRooms` says.
   *
   * Meeting creation enforces the tighter of the two, so when this is lower it — not the stored
   * setting — is the real limit. A workspace whose subscription is not active resolves to the
   * platform default of 5, which is how a settings page reading 20 sat next to "Workspace active
   * room limit (5) has been reached." with nothing on screen connecting them.
   *
   * Absent when the workspace has no entitlement snapshot yet: no plan quota is in force and the
   * stored setting is the only rule.
   */
  maxActiveRoomsCeiling?: number | null;
  /** Where the ceiling came from — "plan:enterprise", "platform_default", … */
  maxActiveRoomsCeilingSource?: string | null;
  /**
   * How many target languages this workspace's plan permits IN ONE MEETING. WT-500.
   *
   * Not a cap on `allowedTargetLanguages`: that list is what a meeting may choose FROM, this is how
   * many it may choose AT ONCE. Meeting creation enforces it, and it used to be invisible until it
   * did — an Owner enabled six languages here and met the refusal somewhere else entirely.
   *
   * Absent when no plan quota is in force (cold start, or no live subscription).
   */
  maxLanguagesCeiling?: number | null;
  /** Where the language ceiling came from. */
  maxLanguagesCeilingSource?: string | null;
  artifactRetentionDays: number;
  /**
   * The classification new minutes in this workspace open at. WT-643.
   *
   * Printed on the face of the minutes document, in the policy block beside retention and
   * circulation. It is stored here because the document writer refuses to print an assurance it
   * cannot back: with nowhere to read a classification from, the line was simply left off, and
   * the alternative — letting the writer pick one — would mean a document generator deciding for
   * itself how sensitive a record is.
   *
   * Defaults to "Internal" server-side. Not a per-document label; overriding a single document is
   * a separate question this field does not answer.
   */
  minutesClassification: MinutesClassification;
  /**
   * Which of the two presentation templates this workspace's minutes open in and export as.
   *
   * Neither is a translation of the other — they are two presentations of the same stored record,
   * and a workspace files under one convention or the other. Defaults to "vn-nd30" server-side,
   * because that is the document this system already writes; defaulting to the other would have
   * restyled every existing workspace's minutes on the day the setting appeared.
   */
  minutesTemplate: MinutesTemplate;
  invitationExpiryDays: number;
  verifiedDomains: string[];
  allowExternalCollaboration: boolean;
  requireVerifiedDomainForInternal: boolean;
  aiUsagePolicy?: AiUsagePolicyDto | null;
  isProfanityFilterEnabled: boolean;
  allowAnyPlugins: boolean;
}

export interface AiUsagePolicyDto {
  allowExternalLlm?: boolean | null;
  redactPii?: PiiRedactionDto | null;
  dlp?: DlpDto | null;
  translationProfile?: TranslationProfileDto | null;
  useGlobalGlossary?: boolean | null;
}

export interface PiiRedactionDto {
  enabled: boolean;
}

export interface DlpDto {
  enabled: boolean;
  keywordsBlacklist?: string[] | null;
}

export interface TranslationProfileDto {
  translationTone?: string | null;
  languageSpecificRules?: LanguageSpecificRulesDto | null;
}

export interface LanguageSpecificRulesDto {
  vietnameseHonorificStyle?: string | null;
  japaneseHonorificStyle?: string | null;
}

export interface WorkspaceMemberDto {
  id: string;
  workspaceId: string;
  userId: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  roleName: string;
  status: string;
  joinedAt: string;
  membershipType: string;
  canCreateMeetings: boolean;
}

export interface WorkspaceRoleChangePreview {
  targetUserId: string;
  currentRole: string;
  targetRole: string;
  membershipType: string;
  canCreateMeetings: boolean;
  impact: string[];
  expiresAt: string;
  previewToken?: string | null;
  coolingOffUntil?: string | null;
}

export interface WorkspaceRoleChangeResult {
  targetUserId?: string;
  oldRole: string;
  newRole: string;
  effectiveAt: string;
  effectiveBehavior?: string;
  auditId: string;
  member?: WorkspaceMemberDto | null;
  idempotencyKey?: string | null;
}

export interface ApplyWorkspaceRoleChangeRequest {
  targetRole: string;
  idempotencyKey: string;
  previewToken: string;
  correlationId?: string | null;
}

export interface WorkspaceInvitationDto {
  id: string;
  workspaceId: string;
  email: string;
  roleName: string;
  status: string;
  membershipType: string;
  deliveryStatus: string;
  providerMessageId?: string | null;
  lastSentAt?: string | null;
  sentCount: number;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
  requestedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  workspaceName?: string | null;
  workspaceSlug?: string | null;
}

export interface ApproveJoinRequestResponse {
  invitation: WorkspaceInvitationDto;
  approvalEmailStatus: "Sent" | "Failed" | string;
  approvalEmailError?: string | null;
}

/**
 * What the workspace currently permits for one candidate address — the inviter still picks
 * the access type, this only says which choices are legal and why one might be disabled.
 */
export interface InvitationPolicyResponse {
  suggestedMembershipType: "Internal" | "External";
  allowedMembershipTypes: ("Internal" | "External")[];
  requireVerifiedDomainForInternal: boolean;
  allowExternalCollaboration: boolean;
  allowSubdomains: boolean;
  isEmailDomainVerified: boolean;
  isPublicEmailDomain: boolean;
  internalDisabledReason?: string | null;
  externalDisabledReason?: string | null;
}

export interface InviteMemberResponse {
  invitation: WorkspaceInvitationDto;
  /**
   * The invitation's plaintext token, returned once to whoever created it so the UI can
   * offer a shareable link. The server has always carried this field and always sent null,
   * which made the invitation email the only way to reach an invitation — and left a valid
   * invitation unreachable whenever delivery failed.
   *
   * Optional on purpose: a client deployed ahead of the server still works, it just falls
   * back to the old email-only behaviour rather than rendering an empty link.
   */
  rawToken?: string | null;
  emailLanguage: string;
  warning?: string | null;
}

export interface PreviewInvitationResponse {
  workspaceName: string;
  roleName: string;
  maskedEmail: string;
  status: string;
  expiresAt: string;
  accountExists: boolean;
}

export interface WorkspaceDocumentDto {
  id: string;
  workspaceId: string;
  uploadedBy?: string | null;
  approvedBy?: string | null;
  ownerId?: string | null;
  name: string;
  fileName: string;
  fileExtension: string;
  mimeType: string;
  sizeBytes: number;
  sourceType: string;
  sourceId?: string | null;
  ingestionStatus: string;
  aiEligible: boolean;
  isAiAllowed: boolean;
  confidentialityLevel: string;
  retentionState: string;
  status: string;
  downloadUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Why the last AI ingestion attempt did not complete, or null when it succeeded or was skipped. */
  ingestionFailureReason?: string | null;
  /**
   * Why a reviewer rejected this document. WT-633.
   *
   * DETAIL ROUTE ONLY — the list evaluates access for every row it returns, and carrying this
   * would add a second audit query per document, so it is absent (not null, absent) from a listed
   * document. It also OUTLIVES the rejection: re-uploading sets the status back to
   * `pending_approval` and the reason stays, because the feedback being answered should still be
   * readable while the answer is under review. Read it together with `status`, never alone.
   */
  rejectionReason?: string | null;
}

/**
 * The document already holding the bytes someone just tried to upload. WT-666.
 *
 * Absent from a 409 body means the caller may not open that document — the collision is real, but
 * naming it would be a way to learn that a document they cannot see exists. Say "already in this
 * workspace" without a name in that case.
 */
export interface DocumentDuplicateDto {
  documentId: string;
  name: string;
  fileName: string;
  status: string;
  sizeBytes: number;
  createdAt: string;
}

/** One entry in a document's approval and feedback history. WT-633. */
export interface DocumentHistoryEntryDto {
  id: string;
  /** The raw audit action — `UploadDocument`, `RejectDocument`, `Reuploaded`, and so on. */
  action: string;
  actorId?: string | null;
  actionAt: string;
  /** The reviewer's rejection reason or the uploader's revision note. Null for other actions. */
  reason?: string | null;
}

export interface WorkspaceDocumentAccessPolicyDto {
  id: string;
  documentId: string;
  workspaceId: string;
  subjectType: string;
  subjectId?: string | null;
  subjectKey?: string | null;
  permission: string;
  effect: string;
  createdAt: string;
}

export interface GlossaryDto {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  termCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GlossaryTermDto {
  id: string;
  glossaryId: string;
  sourceTerm: string;
  targetTerm: string;
  context?: string | null;
  domain?: string | null;
  definition?: string | null;
  usageNote?: string | null;
  partOfSpeech?: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SelectWorkspaceResponse {
  selectedWorkspaceId: string;
  name: string;
  slug: string;
  role: string;
  membershipType: string;
  defaultLanguage?: string;
  /**
   * This member's own meeting-creation permission in the selected workspace. Optional because a
   * backend older than WT-371 #2 does not send it; treat `undefined` as allowed, which is how the
   * app behaved before the field existed.
   */
  canCreateMeetings?: boolean;
}

export interface ExtractedPageDto {
  pageNumber: number;
  text: string;
}

export interface ExtractedSheetDto {
  sheetName: string;
  rows: string[][];
}

export interface ExtractedTextDto {
  fullText: string;
  pages: ExtractedPageDto[];
  sheets: ExtractedSheetDto[];
  text?: string;
}
