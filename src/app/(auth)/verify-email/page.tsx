"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@phosphor-icons/react/dist/ssr";
import apiClient from "@/lib/api/client";
import { CinematicAuthShell } from "@/components/auth/cinematic-auth-shell";

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error",
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    apiClient.post("/auth/verify-email", { token })
      .then(() => setState("success"))
      .catch(() => setState("error"));
  }, [token]);

  return (
    <CinematicAuthShell>
      <div className="space-y-3 text-center">
        {state === "loading" && <Spinner className="mx-auto h-8 w-8 animate-spin" />}
        <h1 className="text-3xl font-medium tracking-tight">
          {state === "loading" ? "Verifying email…" : state === "success" ? "Email verified" : "Verification failed"}
        </h1>
        <p className="text-sm text-white/50">
          {state === "success"
            ? "Your account is ready. You can sign in now."
            : state === "error"
              ? "This link is invalid or expired. Request a new verification email after signing in."
              : "Please wait while we verify your email address."}
        </p>
      </div>
      {state !== "loading" && (
        <Link href="/login" className="flex h-14 items-center justify-center rounded-xl bg-white font-semibold text-black">
          Go to login
        </Link>
      )}
    </CinematicAuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
