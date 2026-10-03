import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { PublishedLanguageDto } from "@/types/glossary-import-template";

/** WT-880 — the languages a glossary import template is offered for. The file shape itself is a
 * fixed default in code (option B), so there is no template endpoint. */
export const GlossaryImportTemplateService = {
  async getPublishedLanguages(): Promise<PublishedLanguageDto[]> {
    const { data } = await apiClient.get<PublishedLanguageDto[]>(API.translationRooms.publishedLanguages);
    return data;
  },
};
