import apiClient from "@/lib/api/client";
import type { SystemLanguage } from "@/hooks/use-system-languages";

export const SystemLanguagesService = {
  getAll: async () => {
    return apiClient.get<SystemLanguage[]>("/api/platform/languages").then((res) => res.data);
  },
  
  getActive: async () => {
    return apiClient.get<SystemLanguage[]>("/api/public/languages").then((res) => res.data);
  },

  create: async (data: { code: string; name: string; nativeName?: string }) => {
    return apiClient.post<SystemLanguage>("/api/platform/languages", data).then((res) => res.data);
  },

  update: async (code: string, data: { name: string; nativeName?: string }) => {
    return apiClient.put<SystemLanguage>(`/api/platform/languages/${code}`, data).then((res) => res.data);
  },

  toggleActive: async (code: string, isActive: boolean) => {
    return apiClient.patch<SystemLanguage>(`/api/platform/languages/${code}/active`, { isActive }).then((res) => res.data);
  },
};
