"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobalGlossaryService } from "@/services/global-glossary.service";
import type {
  GlobalGlossaryTermQuery,
  CreateGlobalGlossaryTermRequest,
  UpdateGlobalGlossaryTermRequest,
  BulkImportGlobalGlossaryTermsRequest,
} from "@/types/global-glossary";

export const GLOBAL_GLOSSARY_KEYS = {
  list: (query: GlobalGlossaryTermQuery) => ["global-glossary", "list", query] as const,
  detail: (id: string) => ["global-glossary", "detail", id] as const,
  audits: (id: string) => ["global-glossary", "audits", id] as const,
};

export function useGlobalGlossaryTerms(query: GlobalGlossaryTermQuery) {
  return useQuery({
    queryKey: GLOBAL_GLOSSARY_KEYS.list(query),
    queryFn: () => GlobalGlossaryService.getTerms(query),
    staleTime: 30000,
  });
}

export function useGlobalGlossaryAudits(id: string) {
  return useQuery({
    queryKey: GLOBAL_GLOSSARY_KEYS.audits(id),
    queryFn: () => GlobalGlossaryService.getAudits(id),
    enabled: !!id,
  });
}

function useInvalidateGlobalGlossary() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["global-glossary"] });
}

export function useCreateGlobalGlossaryTerm() {
  const invalidate = useInvalidateGlobalGlossary();
  return useMutation({
    mutationFn: (request: CreateGlobalGlossaryTermRequest) => GlobalGlossaryService.createTerm(request),
    onSuccess: invalidate,
  });
}

export function useUpdateGlobalGlossaryTerm(id: string) {
  const invalidate = useInvalidateGlobalGlossary();
  return useMutation({
    mutationFn: (request: UpdateGlobalGlossaryTermRequest) => GlobalGlossaryService.updateTerm(id, request),
    onSuccess: invalidate,
  });
}

export function useDeleteGlobalGlossaryTerm() {
  const invalidate = useInvalidateGlobalGlossary();
  return useMutation({
    mutationFn: (id: string) => GlobalGlossaryService.deleteTerm(id),
    onSuccess: invalidate,
  });
}

export function usePublishGlobalGlossaryTerm() {
  const invalidate = useInvalidateGlobalGlossary();
  return useMutation({
    mutationFn: (id: string) => GlobalGlossaryService.publishTerm(id),
    onSuccess: invalidate,
  });
}

export function useArchiveGlobalGlossaryTerm() {
  const invalidate = useInvalidateGlobalGlossary();
  return useMutation({
    mutationFn: (id: string) => GlobalGlossaryService.archiveTerm(id),
    onSuccess: invalidate,
  });
}

export function useBulkImportGlobalGlossaryTerms() {
  const invalidate = useInvalidateGlobalGlossary();
  return useMutation({
    mutationFn: (request: BulkImportGlobalGlossaryTermsRequest) => GlobalGlossaryService.bulkImport(request),
    onSuccess: invalidate,
  });
}
