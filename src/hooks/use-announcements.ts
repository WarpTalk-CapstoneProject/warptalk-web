"use client";

/**
 * What the signed-in user is shown from the announcements CMS, and what they did with it.
 *
 * One query feeds every surface (the banner, modal and toast host in the app shell, the bell
 * panel, the workspace home), so they never disagree about what is live. The server decides the
 * audience, the window and the show frequency; it reads the viewer's locale and a per-tab
 * session id, both sent here.
 *
 * Closing has two meanings, and the difference is the announcement's `dismissible` flag:
 *   dismissible      → DISMISS is recorded; it stays closed on every device (EVERY_SESSION ones
 *                      return next session). Removed from the cache at once.
 *   not dismissible  → only a modal or toast can be closed, and only for this page load — an
 *                      unclosable modal would lock the app. Nothing is recorded.
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { create } from "zustand";

import { browserSessionId, firstSighting } from "@/lib/announcements/viewer-placements";
import { announcementService } from "@/services/announcement.service";
import type { AnnouncementEventType, ViewerAnnouncementDto } from "@/types/admin-cms";

export const ANNOUNCEMENT_KEYS = {
  all: ["announcements", "active"] as const,
  active: (locale: string) => ["announcements", "active", locale] as const,
};

let sessionId: string | null = null;

/** Read lazily, in the browser only: sessionStorage does not exist during server rendering. */
function currentSessionId(): string {
  if (sessionId) return sessionId;
  const store = typeof window === "undefined" ? null : safeSessionStorage();
  sessionId = browserSessionId(store, () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
  );
  return sessionId;
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Ids closed in this page load, shared by every surface. */
const useHiddenAnnouncements = create<{ hidden: ReadonlySet<string>; hide: (id: string) => void }>((set) => ({
  hidden: new Set<string>(),
  hide: (id) => set((state) => ({ hidden: new Set([...state.hidden, id]) })),
}));

export function useHiddenAnnouncementIds(): ReadonlySet<string> {
  return useHiddenAnnouncements((state) => state.hidden);
}

/**
 * Live announcements for the signed-in user, in the UI language. Refreshed every five minutes so
 * a scheduled one appears without a reload; `retry: false` because an announcement is never worth
 * a retry storm (the notification route shares the inbox rate limit).
 */
export function useActiveAnnouncements(enabled: boolean) {
  const locale = useLocale();
  return useQuery({
    queryKey: ANNOUNCEMENT_KEYS.active(locale),
    queryFn: () => announcementService.active(locale, currentSessionId()),
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

const impressionsThisLoad = new Set<string>();

/** Every interaction a surface reports. Analytics are best-effort: failures are swallowed. */
export function useAnnouncementActions() {
  const queryClient = useQueryClient();
  const hide = useHiddenAnnouncements((state) => state.hide);

  const record = useCallback((id: string, type: AnnouncementEventType) => {
    void announcementService.event(id, type, currentSessionId()).catch(() => undefined);
  }, []);

  const dismissMutation = useMutation({
    mutationFn: (id: string) => announcementService.event(id, "DISMISS", currentSessionId()),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ANNOUNCEMENT_KEYS.all });
      queryClient.setQueriesData<ViewerAnnouncementDto[]>({ queryKey: ANNOUNCEMENT_KEYS.all }, (current) =>
        current?.filter((announcement) => announcement.id !== id),
      );
    },
  });

  const seen = useCallback(
    (id: string) => {
      if (firstSighting(impressionsThisLoad, id)) record(id, "IMPRESSION");
    },
    [record],
  );

  const close = useCallback(
    (announcement: Pick<ViewerAnnouncementDto, "id" | "dismissible">) => {
      hide(announcement.id);
      if (announcement.dismissible) dismissMutation.mutate(announcement.id);
    },
    [dismissMutation, hide],
  );

  const clicked = useCallback(
    (id: string, secondary = false) => record(id, secondary ? "SECONDARY_CLICK" : "CTA_CLICK"),
    [record],
  );

  return { seen, close, clicked };
}
