import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authService } from "@/services/auth.service";
import type { UpdateUserSettingsRequest } from "@/types/auth";

const USER_SETTINGS_KEY = ["user-settings"] as const;

/**
 * The signed-in user's own preferences, including the speak/listen languages the meeting
 * picker remembers.
 *
 * Those two fields have existed on the settings DTO since it was written, and until now only
 * the preferences page read them — the meeting picker neither read nor wrote them, which is
 * why it asked the same person the same question on every single join.
 */
export function useUserSettings() {
  return useQuery({
    queryKey: USER_SETTINGS_KEY,
    queryFn: async () => (await authService.getSettings()).data,
    // Preferences change rarely and are read on every meeting join.
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateUserSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: UpdateUserSettingsRequest) =>
      (await authService.updateSettings(request)).data,
    onSuccess: (settings) => {
      // Written straight into the cache: the next meeting must not ask again while a
      // refetch is still in flight, which is the whole point of remembering.
      queryClient.setQueryData(USER_SETTINGS_KEY, settings);
    },
  });
}
