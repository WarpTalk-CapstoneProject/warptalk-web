import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  GlossaryImportTemplateDto,
  PublishedLanguageDto,
  UpdateGlossaryImportTemplateRequest,
} from "@/types/glossary-import-template";

/** WT-880 — the glossary import file shape (TranscriptService) and the languages it is offered for. */
export const GlossaryImportTemplateService = {
  /** Any signed-in user: the workspace "Import template" tab and the Import dialog. */
  async get(): Promise<GlossaryImportTemplateDto> {
    const { data } = await apiClient.get<GlossaryImportTemplateDto>(API.glossaries.importTemplate);
    return data;
  },

  async getAdmin(): Promise<GlossaryImportTemplateDto> {
    const { data } = await apiClient.get<GlossaryImportTemplateDto>(API.adminGlobalGlossary.importTemplate);
    return data;
  },

  async update(request: UpdateGlossaryImportTemplateRequest): Promise<GlossaryImportTemplateDto> {
    const { data } = await apiClient.put<GlossaryImportTemplateDto>(API.adminGlobalGlossary.importTemplate, request);
    return data;
  },

  async reset(): Promise<GlossaryImportTemplateDto> {
    const { data } = await apiClient.delete<GlossaryImportTemplateDto>(API.adminGlobalGlossary.importTemplate);
    return data;
  },

  async getPublishedLanguages(): Promise<PublishedLanguageDto[]> {
    const { data } = await apiClient.get<PublishedLanguageDto[]>(API.translationRooms.publishedLanguages);
    return data;
  },
};
