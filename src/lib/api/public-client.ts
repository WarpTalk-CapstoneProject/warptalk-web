import axios from "axios";

import { useAuthStore } from "@/stores/auth-store";

/**
 * The client for pages a stranger can open — today, a shared biên bản.
 *
 * WHY NOT THE ORDINARY apiClient
 *   That one is built for a signed-in app: a 401 makes it refresh the session, and a refresh that
 *   fails marks the session dead and sends the tab to /login. On a share link that behaviour is
 *   exactly wrong. A visitor with no account is not an expired session, and bouncing them to a
 *   login screen — or worse, latching a real user's session shut because a restricted link said
 *   401 — turns "you need to sign in to open this" into "you have been logged out".
 *
 * WHY IT STILL SENDS A TOKEN WHEN THERE IS ONE
 *   A restricted link is opened by a person who was invited by email, and the server can only
 *   match that email if the request says who is asking. So the header is attached when the app
 *   happens to have a session and omitted when it does not — no refresh, no redirect, no retry.
 */
const publicApiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5200/api/v1",
  timeout: 30_000,
});

publicApiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default publicApiClient;
