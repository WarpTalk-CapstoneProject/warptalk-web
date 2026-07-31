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

export interface CreateWorkspaceRequest {
  name: string;
  logoUrl?: string | null;
  verifiedDomains?: string[];
  requireVerifiedDomainForInternal?: boolean;
}

export interface VerifiedDomainDto {
  id: string;
  domain: string;
  status: string;
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
  artifactRetentionDays: number;
  invitationExpiryDays: number;
  enforceHostApprovalDefault: boolean;
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
  targetUserId: string;
  oldRole: string;
  newRole: string;
  effectiveAt: string;
  effectiveBehavior: string;
  auditId: string;
  member?: WorkspaceMemberDto | null;
  idempotencyKey?: string | null;
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

export interface InviteMemberResponse {
  invitation: WorkspaceInvitationDto;
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
  defaultLanguage?: string;
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
