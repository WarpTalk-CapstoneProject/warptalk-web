import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AuthResponse,
  ChangePasswordRequest,
  GoogleLoginRequest,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserDto,
  UserSettingsDto,
  UpdateUserSettingsRequest,
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

  // No refresh() here on purpose. The one that used to sit at this spot took a refresh token
  // as an argument and had no callers — the real refresh lives in lib/api/client.ts, which
  // must hold the Web Lock and must not re-enter the interceptor that usually calls it.

  /**
   * Revoke the session server-side.
   *
   * The endpoint is `[Authorize]`, and this is called while the session is
   * being torn down, so the departing access token has to be handed over
   * explicitly — by the time the request interceptor would look one up, the
   * store is already empty. /auth/logout is exempt from interceptor management
   * in lib/api/client.ts precisely so this header survives.
   *
   * The body is empty: the refresh token being revoked is the HttpOnly
   * `warptalk_refresh` cookie, which this side cannot read and does not need to.
   * `withCredentials` on the client sends it, and the endpoint's path is inside
   * the cookie's own Path scope.
   */
  logout(accessToken?: string | null) {
    return apiClient.post<void>(API.auth.logout, {}, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
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

  getSettings() {
    return apiClient.get<UserSettingsDto>(API.auth.settings);
  },

  updateSettings(data: UpdateUserSettingsRequest) {
    return apiClient.put<UserSettingsDto>(API.auth.settings, data);
  },
};
