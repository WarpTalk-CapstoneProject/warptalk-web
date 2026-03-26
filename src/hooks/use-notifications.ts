"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationService } from "@/services/notification.service";
import type { UpdateNotificationPreferenceRequest } from "@/types/notification";

const PREFS_KEY = ["notifications", "preferences"] as const;

/** Fetch notification preferences */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: PREFS_KEY,
    queryFn: async () => {
      const { data } = await notificationService.getPreferences();
      return data;
    },
  });
}

/** Update notification preferences mutation */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateNotificationPreferenceRequest) => {
      const { data: pref } = await notificationService.updatePreferences(data);
      return pref;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PREFS_KEY });
    },
  });
}
