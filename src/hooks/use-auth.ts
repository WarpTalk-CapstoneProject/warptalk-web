"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { authService } from "@/services/auth.service";
import type {
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
} from "@/types/auth";

const PROFILE_KEY = ["auth", "profile"] as const;

/** Fetch current user profile */
export function useProfile() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async () => {
      const { data } = await authService.getProfile();
      return data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

/** Login mutation */
export function useLogin() {
  const login = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      const { data: res } = await authService.login(data);
      return res;
    },
    onSuccess: (res) => {
      login(res.user, res.accessToken, res.refreshToken);
    },
  });
}

/** Register mutation */
export function useRegister() {
  const login = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const { data: res } = await authService.register(data);
      return res;
    },
    onSuccess: (res) => {
      login(res.user, res.accessToken, res.refreshToken);
    },
  });
}

/** Logout mutation */
export function useLogout() {
  const { refreshToken, logout } = useAuthStore.getState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await authService.logout({ refreshToken });
      }
    },
    onSettled: () => {
      logout();
      queryClient.clear();
    },
  });
}

/** Update profile mutation */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: async (data: UpdateProfileRequest) => {
      const { data: user } = await authService.updateProfile(data);
      return user;
    },
    onSuccess: (user) => {
      updateUser(user);
      queryClient.setQueryData(PROFILE_KEY, user);
    },
  });
}

/** Change password mutation */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: ChangePasswordRequest) => {
      await authService.changePassword(data);
    },
  });
}
