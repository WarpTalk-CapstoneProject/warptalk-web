"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminInboxService } from "@/services/admin-inbox.service";

export const ADMIN_INBOX_KEYS = {
  all: ["admin", "inbox"] as const,
  list: ["admin", "inbox", "list"] as const,
  summary: ["admin", "inbox", "summary"] as const,
  notes: (key: string) => ["admin", "inbox", "notes", key] as const,
};

/** The inbox. The server caches each person's fan-out for 30 s, so a minute's refresh is cheap. */
export function useAdminInbox() {
  return useQuery({
    queryKey: ADMIN_INBOX_KEYS.list,
    queryFn: () => adminInboxService.get(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** The sidebar badge. Off for anyone without inbox.read, so their sidebar never asks. */
export function useAdminInboxSummary(enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_INBOX_KEYS.summary,
    queryFn: () => adminInboxService.summary(),
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 90_000 : false,
  });
}

export function useAdminInboxNotes(key: string | null) {
  return useQuery({
    queryKey: ADMIN_INBOX_KEYS.notes(key ?? ""),
    queryFn: () => adminInboxService.notes(key!),
    enabled: Boolean(key),
  });
}

export function useAdminInboxActions() {
  const queryClient = useQueryClient();
  const onSuccess = () => void queryClient.invalidateQueries({ queryKey: ADMIN_INBOX_KEYS.all });
  return {
    refresh: useMutation({
      mutationFn: () => adminInboxService.get(true),
      onSuccess: (data) => {
        queryClient.setQueryData(ADMIN_INBOX_KEYS.list, data);
        void queryClient.invalidateQueries({ queryKey: ADMIN_INBOX_KEYS.summary });
      },
    }),
    assign: useMutation({
      mutationFn: ({ key, assigneeId }: { key: string; assigneeId: string | null }) => adminInboxService.assign(key, assigneeId),
      onSuccess,
    }),
    snooze: useMutation({
      mutationFn: ({ key, until }: { key: string; until: string | null }) => adminInboxService.snooze(key, until),
      onSuccess,
    }),
    done: useMutation({ mutationFn: (key: string) => adminInboxService.done(key), onSuccess }),
    reopen: useMutation({ mutationFn: (key: string) => adminInboxService.reopen(key), onSuccess }),
    addNote: useMutation({
      mutationFn: ({ key, body }: { key: string; body: string }) => adminInboxService.addNote(key, body),
      onSuccess,
    }),
  };
}
