"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminAnnouncementCmsService } from "@/services/admin-announcement-cms.service";
import type {
  AdminAnnouncementCmsQuery,
  PublishAnnouncementRequest,
  UpsertAnnouncementRequest,
} from "@/types/admin-cms";

export const ADMIN_ANNOUNCEMENT_CMS_KEYS = {
  all: ["admin-announcement-cms"] as const,
  list: (query: AdminAnnouncementCmsQuery) => ["admin-announcement-cms", "list", query] as const,
  detail: (id: string) => ["admin-announcement-cms", "detail", id] as const,
};

export function useAdminAnnouncementCmsList(query: AdminAnnouncementCmsQuery) {
  return useQuery({
    queryKey: ADMIN_ANNOUNCEMENT_CMS_KEYS.list(query),
    queryFn: () => adminAnnouncementCmsService.list(query),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useAdminAnnouncementCms(id: string | undefined) {
  return useQuery({
    queryKey: ADMIN_ANNOUNCEMENT_CMS_KEYS.detail(id ?? ""),
    queryFn: () => adminAnnouncementCmsService.get(id!),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

/**
 * Every write invalidates the whole CMS cache and the viewer feed: a publish changes counts on
 * every tab and what the admin themself sees in the app banner.
 */
function useCmsMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_ANNOUNCEMENT_CMS_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: ["announcements", "active"] }),
      ]),
  });
}

export function useCreateAnnouncement() {
  return useCmsMutation((request: UpsertAnnouncementRequest) => adminAnnouncementCmsService.create(request));
}

export function useUpdateAnnouncement() {
  return useCmsMutation(({ id, request }: { id: string; request: UpsertAnnouncementRequest }) =>
    adminAnnouncementCmsService.update(id, request),
  );
}

export function usePublishAnnouncement() {
  return useCmsMutation(({ id, request }: { id: string; request: PublishAnnouncementRequest }) =>
    adminAnnouncementCmsService.publish(id, request),
  );
}

export function useUnpublishAnnouncement() {
  return useCmsMutation((id: string) => adminAnnouncementCmsService.unpublish(id));
}

export function useArchiveAnnouncement() {
  return useCmsMutation((id: string) => adminAnnouncementCmsService.archive(id));
}

export function useDuplicateAnnouncement() {
  return useCmsMutation((id: string) => adminAnnouncementCmsService.duplicate(id));
}

export function useDeleteAnnouncement() {
  return useCmsMutation((id: string) => adminAnnouncementCmsService.remove(id));
}
