"use client";

/**
 * The page a new account lands on, and the page a verification link opens.
 *
 * WT-597 — those are two different situations and this told both of them the same thing.
 *
 * Register redirects here WITHOUT a token, because the address is personal data and a URL is the
 * one place every proxy on the way would log it. The page read "no token" as "bad token" and
 * greeted every new account with **"Verification failed — this link is invalid or expired"**,
 * seconds after it had been created and before any link had been opened.
 *
 * The advice underneath was worse than wrong: "request a new verification email after signing in"
 * describes something that cannot be done. Signing in is exactly what an unverified account is
 * refused (BR-02), so the one way out pointed back through the locked door. That dead end is why
 * production ran with auto-verify switched on — which silently traded away the spec-137
 * anti-takeover guard to keep registration usable at all.
 *
 * So there are three states, not two:
 *   no token  — "check your inbox", and a way to send it again from right here.
 *   verifying — the link was opened; this is the only state that talks about a link.
 *   done      — verified, or the link is genuinely spent.
 */

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { CinematicAuthShell } from "@/components/auth/cinematic-auth-shell";

type State = "awaiting-inbox" | "loading" | "success" | "error";

function VerifyEmailContent() {
  const t = useTranslations("auth.verifyEmail");
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>(token ? "loading" : "awaiting-inbox");

  useEffect(() => {
    if (!token) {
      return;
    }
    apiClient
      .post("/auth/verify-email", { token })
      .then(() => setState("success"))
      .catch(() => setState("error"));
  }, [token]);

  const heading =
    state === "awaiting-inbox"
      ? t("headingAwaitingInbox")
      : state === "loading"
        ? t("headingLoading")
        : state === "success"
          ? t("headingSuccess")
          : t("headingError");

  const detail =
    state === "awaiting-inbox"
      ? t("detailAwaitingInbox")
      : state === "success"
        ? t("detailSuccess")
        : state === "error"
          ? t("detailError")
          : t("detailLoading");

  return (
    <CinematicAuthShell>
      <div className="space-y-3 text-center">
        {state === "loading" && <Spinner className="mx-auto h-8 w-8 animate-spin" />}
        <h1 className="text-3xl font-medium tracking-tight">{heading}</h1>
        <p className="text-sm text-white/50">{detail}</p>
      </div>

      {/* Offered in both states that leave the reader stuck: no mail arrived, or the link died.
          Never after a success — there is nothing left to verify. */}
      {(state === "awaiting-inbox" || state === "error") && <ResendVerification />}

      {state !== "loading" && (
        <Link
          href="/login"
          className="flex h-14 items-center justify-center rounded-xl bg-white font-semibold text-black"
        >
          {t("goToLogin")}
        </Link>
      )}
    </CinematicAuthShell>
  );
}

/**
 * Sends a fresh verification link to a typed address.
 *
 * The address is asked for rather than remembered: there is no session here to read it from, and
 * putting it in the URL is what the register redirect deliberately avoids.
 *
 * The confirmation is the same sentence whatever the address turns out to be, matching the
 * server's own 204-for-everything answer. Saying "no account with that address" here would make
 * this an account-existence oracle for anyone who can load the page.
 */
function ResendVerification() {
  const t = useTranslations("auth.verifyEmail");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || sending) return;

    setSending(true);
    try {
      await apiClient.post(API.auth.resendVerification, { email: email.trim() });
      setSent(true);
    } catch {
      // Only a failure to REACH us lands here; the server reports every outcome about the address
      // itself as success. So this is "try again", not "that address is wrong".
      toast.error(t("toasts.resendFailed"));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <p className="text-center text-sm text-white/50">
        {t("resendSentMessage")}
      </p>
    );
  }

  return (
    <form onSubmit={resend} className="space-y-3">
      <label htmlFor="resend-email" className="block text-sm text-white/50">
        {t("resendLabel")}
      </label>
      <input
        id="resend-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t("resendPlaceholder")}
        className="h-14 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
      />
      <button
        type="submit"
        disabled={sending}
        className="flex h-14 w-full items-center justify-center rounded-xl border border-white/20 font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
      >
        {sending ? t("resendButtonSending") : t("resendButton")}
      </button>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
