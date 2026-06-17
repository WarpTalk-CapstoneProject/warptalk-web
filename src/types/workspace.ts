<<<<<<< HEAD
export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  role: string;
  createdAt: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  logoUrl?: string | null;
  verifiedDomains?: string[];
  requireVerifiedDomainForInternal?: boolean;
}

export interface WorkspaceSettingsDto {
  defaultLanguage: string;
  timezone: string;
  allowedTargetLanguages: string[];
  voiceCloningEnabled: boolean;
  maxActiveRooms: number;
  artifactRetentionDays: number;
  enforceHostApprovalDefault: boolean;
  verifiedDomains: string[];
  allowExternalCollaboration: boolean;
  requireVerifiedDomainForInternal: boolean;
  aiUsagePolicy?: AiUsagePolicyDto | null;
}

export interface AiUsagePolicyDto {
  allowExternalLlm?: boolean | null;
  redactPii?: PiiRedactionDto | null;
  dlp?: DlpDto | null;
  translationProfile?: TranslationProfileDto | null;
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

export interface WorkspaceInvitationDto {
  id: string;
  workspaceId: string;
  email: string;
  roleName: string;
  status: string;
  membershipType: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
}

export interface InviteMemberResponse {
  invitation: WorkspaceInvitationDto;
  rawToken: string;
  emailLanguage: string;
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
  ownerId?: string | null;
  name: string;
  fileName: string;
  fileExtension: string;
  mimeType: string;
  sizeBytes: number;
  sourceType: string;
  sourceId?: string | null;
  ingestionStatus: string;
  isSensitive: boolean;
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
  businessDomain: string;
  sourceLanguage: string;
  targetLanguage: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GlossaryTermDto {
  id: string;
  glossaryId: string;
  term: string;
  preferredTranslation: string;
  definition?: string | null;
  usageNote?: string | null;
  status: string;
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
=======
export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  roleId: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  membershipType: "internal" | "external";
  status: "active" | "inactive" | "invited";
  joinedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  allowExternalCollaboration: boolean;
  isActive: boolean;
>>>>>>> origin/development
}
