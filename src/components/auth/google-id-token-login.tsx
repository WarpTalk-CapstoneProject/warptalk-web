"use client";

import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { toast } from "sonner";

import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { AuthResponse } from "@/types/auth";

type GoogleIdTokenLoginProps = {
  onAuthenticated: (response: AuthResponse) => void;
  errorMessage: string;
  missingCredentialMessage?: string;
  width?: string;
};

export function GoogleIdTokenLogin({
  onAuthenticated,
  errorMessage,
  missingCredentialMessage = "Google authentication failed.",
  width = "320",
}: GoogleIdTokenLoginProps) {
  async function handleGoogleCredential(response: CredentialResponse) {
    try {
      const idToken = response.credential?.trim();
      if (!idToken) {
        toast.error(missingCredentialMessage);
        return;
      }

      const authResponse = await apiClient.post<AuthResponse>(
        API.auth.googleLogin,
        { idToken },
      );
      onAuthenticated(authResponse.data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || errorMessage);
    }
  }

  return (
    <div className="flex w-full justify-center">
      <GoogleLogin
        onSuccess={handleGoogleCredential}
        onError={() => toast.error(missingCredentialMessage)}
        text="continue_with"
        shape="pill"
        width={width}
      />
    </div>
  );
}
