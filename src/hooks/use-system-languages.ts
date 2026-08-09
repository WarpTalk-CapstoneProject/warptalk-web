"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SystemLanguagesService } from "@/services/system-languages.service";

export interface SystemLanguage {
  code: string;
  name: string;
  nativeName?: string;
  isActive: boolean;
}

export const SYSTEM_LANGUAGE_KEYS = {
  all: ["system-languages", "all"] as const,
  active: ["system-languages", "active"] as const,
};

export function useSystemLanguages() {
  const query = useQuery({
    queryKey: SYSTEM_LANGUAGE_KEYS.all,
    queryFn: () => SystemLanguagesService.getAll(),
    staleTime: 30000,
  });

  return {
    languages: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function usePublicSystemLanguages() {
  const query = useQuery({
    queryKey: SYSTEM_LANGUAGE_KEYS.active,
    queryFn: () => SystemLanguagesService.getActive(),
    staleTime: 60000,
  });

  return {
    languages: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useCreateSystemLanguage() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: { code: string; name: string; nativeName?: string }) =>
      SystemLanguagesService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-languages"] });
    },
  });

  return {
    createLanguage: mutation.mutateAsync,
    isCreating: mutation.isPending,
  };
}

export function useUpdateSystemLanguage() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: { code: string; name: string; nativeName?: string }) =>
      SystemLanguagesService.update(data.code, { name: data.name, nativeName: data.nativeName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-languages"] });
    },
  });

  return {
    updateLanguage: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}

export function useToggleSystemLanguage() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: { code: string; isActive: boolean }) =>
      SystemLanguagesService.toggleActive(data.code, data.isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-languages"] });
    },
  });

  return {
    toggleLanguage: mutation.mutateAsync,
    isToggling: mutation.isPending,
  };
}
