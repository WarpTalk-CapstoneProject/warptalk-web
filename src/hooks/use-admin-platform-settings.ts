"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminPlatformSettingsService, platformStatusService } from "@/services/admin-platform-settings.service";
import type {
  PlatformSettingResetRequest,
  PlatformSettingsImportRequest,
  PlatformSettingWriteRequest,
} from "@/types/admin-platform-settings";

export const ADMIN_PLATFORM_SETTINGS_KEYS = {
  all: ["admin", "platform-settings"] as const,
  console: ["admin", "platform-settings", "console"] as const,
  history: (key: string | null) => ["admin", "platform-settings", "history", key ?? "*"] as const,
  integrations: ["admin", "platform-settings", "integrations"] as const,
};

export const PLATFORM_STATUS_KEY = ["platform", "status"] as const;

/** The console: every registry entry with what is stored for it, and the publish status. */
export function useAdminPlatformSettings(enabled = true) {
  return useQuery({
    queryKey: ADMIN_PLATFORM_SETTINGS_KEYS.console,
    queryFn: () => adminPlatformSettingsService.get(),
    enabled,
    staleTime: 30_000,
  });
}

export function useAdminPlatformSettingHistory(key: string | null) {
  return useQuery({
    queryKey: ADMIN_PLATFORM_SETTINGS_KEYS.history(key),
    queryFn: () => adminPlatformSettingsService.history(key, 100),
    enabled: Boolean(key),
  });
}

export function useAdminPlatformIntegrations(enabled = true) {
  return useQuery({
    queryKey: ADMIN_PLATFORM_SETTINGS_KEYS.integrations,
    queryFn: () => adminPlatformSettingsService.integrations(),
    enabled,
    staleTime: 60_000,
    // An older backend has no integrations endpoint yet: one 404 is the answer, not a retry loop.
    retry: false,
  });
}

/** Every write invalidates the console, the history and the public status (maintenance, Google). */
export function useAdminPlatformSettingsActions() {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_PLATFORM_SETTINGS_KEYS.all });
    void queryClient.invalidateQueries({ queryKey: PLATFORM_STATUS_KEY });
  };
  return {
    set: useMutation({
      mutationFn: ({ key, request }: { key: string; request: PlatformSettingWriteRequest }) => adminPlatformSettingsService.set(key, request),
      onSuccess,
    }),
    reset: useMutation({
      mutationFn: ({ key, request }: { key: string; request: PlatformSettingResetRequest }) => adminPlatformSettingsService.reset(key, request),
      onSuccess,
    }),
    revert: useMutation({
      mutationFn: ({ changeId, reason }: { changeId: string; reason?: string }) => adminPlatformSettingsService.revert(changeId, reason),
      onSuccess,
    }),
    exportSettings: useMutation({ mutationFn: () => adminPlatformSettingsService.export() }),
    importSettings: useMutation({
      mutationFn: (request: PlatformSettingsImportRequest) => adminPlatformSettingsService.import(request),
      onSuccess: (result) => {
        if (result.applied) onSuccess();
      },
    }),
    testIntegration: useMutation({
      mutationFn: (key: string) => adminPlatformSettingsService.testIntegration(key),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ADMIN_PLATFORM_SETTINGS_KEYS.integrations }),
    }),
  };
}

/**
 * The anonymous platform status (maintenance banner, support address, Google sign-in), polled every
 * minute. The gateway caches it for 15 s, so every open tab asking costs next to nothing. A failure
 * keeps the last answer: a status call that cannot reach the server must not hide the sign-in
 * buttons or invent a maintenance window.
 */
export function usePlatformStatus() {
  return useQuery({
    queryKey: PLATFORM_STATUS_KEY,
    queryFn: () => platformStatusService.get(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
