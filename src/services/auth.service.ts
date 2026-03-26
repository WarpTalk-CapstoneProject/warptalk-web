import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AuthResponse,
  ChangePasswordRequest,
  GoogleLoginRequest,
  LoginRequest,
  LogoutRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserDto,
} from "@/types/auth";

/** Auth service — maps to AuthController endpoints */
export const authService = {
  register(data: RegisterRequest) {
    return apiClient.post<AuthResponse>(API.auth.register, data);
  },

  login(data: LoginRequest) {
    return apiClient.post<AuthResponse>(API.auth.login, data);
  },

  googleLogin(data: GoogleLoginRequest) {
    return apiClient.post<AuthResponse>(API.auth.googleLogin, data);
  },

  refresh(refreshToken: string) {
    return apiClient.post<AuthResponse>(API.auth.refresh, { refreshToken });
  },

  logout(data: LogoutRequest) {
    return apiClient.post<void>(API.auth.logout, data);
  },

  getProfile() {
    return apiClient.get<UserDto>(API.auth.me);
  },

  updateProfile(data: UpdateProfileRequest) {
    return apiClient.put<UserDto>(API.auth.me, data);
  },

  changePassword(data: ChangePasswordRequest) {
    return apiClient.post<void>(API.auth.changePassword, data);
  },
};
