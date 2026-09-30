"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ADMIN_EMAIL_TEMPLATE_KEYS } from "@/hooks/use-admin-email-templates";
import { CMS_AUDIT_KEYS } from "@/hooks/use-cms-audit";
import { adminEmailSendService } from "@/services/admin-email-send.service";
import type { CreateEmailSendRequest, EmailAudienceDto } from "@/types/admin-cms";

export const EMAIL_SEND_KEYS = {
  all: ["admin-email-sends"] as const,
  list: (key: string) => ["admin-email-sends", "list", key] as const,
  detail: (id: string) => ["admin-email-sends", "detail", id] as const,
  recipients: (id: string, status: string | null, page: number) => ["admin-email-sends", "recipients", id, status, page] as const,
};

const ACTIVE = new Set(["QUEUED", "SENDING"]);

/** A template's sends, refreshed every 5 s while one is queued or sending. */
export function useEmailSends(key: string | undefined, enabled = true) {
  return useQuery({
    queryKey: EMAIL_SEND_KEYS.list(key ?? ""),
    queryFn: () => adminEmailSendService.list(key!),
    enabled: Boolean(key) && enabled,
    staleTime: 5_000,
    refetchInterval: (query) => (query.state.data?.some((send) => ACTIVE.has(send.status)) ? 5_000 : false),
    retry: false,
  });
}

export function useEmailSendRecipients(id: string | undefined, status: string | null, page: number, live: boolean) {
  return useQuery({
    queryKey: EMAIL_SEND_KEYS.recipients(id ?? "", status, page),
    queryFn: () => adminEmailSendService.recipients(id!, status, page, 50),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
    refetchInterval: live ? 5_000 : false,
    retry: false,
  });
}

/** How many people an audience reaches now. Sends nothing; a POST only because the audience is a body. */
export function useEmailSendEstimate() {
  return useMutation({
    mutationFn: ({ key, audience }: { key: string; audience: EmailAudienceDto }) => adminEmailSendService.estimate(key, audience),
  });
}

function useSendWrite<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: EMAIL_SEND_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: ADMIN_EMAIL_TEMPLATE_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: CMS_AUDIT_KEYS.all }),
      ]),
  });
}

export function useStartEmailSend() {
  return useSendWrite(({ key, request }: { key: string; request: CreateEmailSendRequest }) => adminEmailSendService.start(key, request));
}

export function useCancelEmailSend() {
  return useSendWrite((id: string) => adminEmailSendService.cancel(id));
}
