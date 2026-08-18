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
  artifactRetentionDays: number;
  invitationExpiryDays: number;
  verifiedDomains: string[];
  allowExternalCollaboration: boolean;
  requireVerifiedDomainForInternal: boolean;
  aiUsagePolicy?: AiUsagePolicyDto | null;
  isProfanityFilterEnabled: boolean;
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
