import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  GlobalGlossaryTermDto,
  GlobalGlossaryAuditDto,
  PagedResultDto,
  GlobalGlossaryTermQuery,
  CreateGlobalGlossaryTermRequest,
  UpdateGlobalGlossaryTermRequest,
  BulkImportGlobalGlossaryTermsRequest,
  BulkImportResultDto,
} from "@/types/global-glossary";

export const GlobalGlossaryService = {
  async getTerms(query: GlobalGlossaryTermQuery): Promise<PagedResultDto<GlobalGlossaryTermDto>> {
    const { data } = await apiClient.get<PagedResultDto<GlobalGlossaryTermDto>>(API.adminGlobalGlossary.base, {
      params: query,
    });
    return data;
  },

  async getTerm(id: string): Promise<GlobalGlossaryTermDto> {
    const { data } = await apiClient.get<GlobalGlossaryTermDto>(API.adminGlobalGlossary.detail(id));
    return data;
  },

  async createTerm(request: CreateGlobalGlossaryTermRequest): Promise<GlobalGlossaryTermDto> {
    const { data } = await apiClient.post<GlobalGlossaryTermDto>(API.adminGlobalGlossary.base, request);
    return data;
  },

  async updateTerm(id: string, request: UpdateGlobalGlossaryTermRequest): Promise<void> {
    await apiClient.put(API.adminGlobalGlossary.detail(id), request);
  },

  async deleteTerm(id: string): Promise<void> {
    await apiClient.delete(API.adminGlobalGlossary.detail(id));
  },

  async publishTerm(id: string): Promise<void> {
    await apiClient.post(API.adminGlobalGlossary.publish(id));
  },

  async archiveTerm(id: string): Promise<void> {
    await apiClient.post(API.adminGlobalGlossary.archive(id));
  },

  async bulkImport(request: BulkImportGlobalGlossaryTermsRequest): Promise<BulkImportResultDto> {
    const { data } = await apiClient.post<BulkImportResultDto>(API.adminGlobalGlossary.bulkImport, request);
    return data;
  },

  async getAudits(id: string): Promise<GlobalGlossaryAuditDto[]> {
    const { data } = await apiClient.get<GlobalGlossaryAuditDto[]>(API.adminGlobalGlossary.audits(id));
    return data;
  },
};
