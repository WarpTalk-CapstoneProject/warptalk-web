// Field names match WarpTalk.TranscriptService.Application.DTOs GlobalGlossaryDtos.cs exactly.

export interface GlobalGlossaryTermDto {
  id: string;
  term: string;
  preferredTranslation: string;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  businessDomain?: string | null;
  definition?: string | null;
  usageNote?: string | null;
  priority: number;
  status: "draft" | "published" | "archived";
  version: number;
  createdAt: string;
  createdBy?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface GlobalGlossaryAuditDto {
  id: string;
  termId: string;
  action: "created" | "updated" | "published" | "archived" | "deleted";
  beforeJson?: string | null;
  afterJson?: string | null;
  actorUserId: string;
  createdAt: string;
}

export interface PagedResultDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface GlobalGlossaryTermQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  businessDomain?: string;
  language?: string;
  search?: string;
}

export interface CreateGlobalGlossaryTermRequest {
  term: string;
  preferredTranslation: string;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  businessDomain?: string | null;
  definition?: string | null;
  usageNote?: string | null;
  priority?: number;
}

export type UpdateGlobalGlossaryTermRequest = Required<
  Pick<CreateGlobalGlossaryTermRequest, "term" | "preferredTranslation" | "priority">
> &
  Pick<
    CreateGlobalGlossaryTermRequest,
    "sourceLanguage" | "targetLanguage" | "businessDomain" | "definition" | "usageNote"
  >;

export interface BulkImportGlobalGlossaryTermsRequest {
  rows: CreateGlobalGlossaryTermRequest[];
}

export interface BulkImportResultDto {
  imported: number;
  skipped: number;
  errors: string[];
}
