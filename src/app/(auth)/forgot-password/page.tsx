"use client";

/**
 * WT-837: this page was still the dark `CinematicAuthShell` after /login and /register moved to
 * the white halftone design (see register/page.tsx's own note on why). The visitor journey is
 * login -> "Forgot password?" -> this page, so the jump from white to black happened mid-flow,
 * not between unrelated pages. Rebuilt to the login page's own layout, down to the input height.
 */

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Spinner, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { useGoogleLogin } from "@react-oauth/google";

import { useGoogleSignInOffered } from "@/components/platform/platform-status-banner";
import { AnimatedHalftone } from "@/components/auth/animated-halftone";
import { GoogleAuthIcon } from "@/components/auth/cinematic-auth-shell";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { getErrorMessage } from "@/lib/api/errors";
import { resolvePostLoginDestination } from "@/lib/auth/post-login-destination";
import { setAccessTokenCookie } from "@/lib/auth/session-cookie";
import { recallLastWorkspaceSlug } from "@/lib/workspace/last-workspace";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";

type ForgotFormData = { email: string };
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

function GoogleUnavailableButton() {
  const t = useTranslations("auth.login");
  return (
    <button
      type="button"
      disabled
      title={t("googleUnavailableHint")}
      className="flex h-14 w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-neutral-200 bg-neutral-50 text-[15px] font-medium text-neutral-400"
    >
      <GoogleAuthIcon className="size-5" />
      {t("continueWithGoogle")}
    </button>
  );
}

function GoogleForgotButton() {
  const t = useTranslations("auth.login");
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  // Same rule as the login page: nothing on this path may be written to the console, since both
  // the Google token and the AuthResponse carry live credentials.
  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res = await apiClient.post<AuthResponse>(API.auth.googleLogin, {
          idToken: tokenResponse.access_token,
        });
        const { user, accessToken, expiresAt } = res.data;
        login(user, accessToken);
        setAccessTokenCookie(accessToken, expiresAt);
        toast.success(t("toasts.googleLoginSuccess"));
        router.replace(
          resolvePostLoginDestination({
            callbackUrl: null,
            lastWorkspaceSlug: recallLastWorkspaceSlug(user.id),
          }),
        );
      } catch (err: unknown) {
        toast.error(getErrorMessage(err, t("toasts.googleLoginFailed")));
      }
    },
    onError: () => toast.error(t("toasts.googleAuthFailed")),
  });

  return (
    <button
      type="button"
      onClick={() => handleGoogleLogin()}
      className="flex h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-neutral-300 bg-white text-[15px] font-medium text-black transition-colors hover:bg-neutral-50"
    >
      <GoogleAuthIcon className="size-5" />
      {t("continueWithGoogle")}
    </button>
  );
}

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const tv = useTranslations("validation");
  const router = useRouter();
  const googleOffered = useGoogleSignInOffered();

  const forgotSchema = z.object({
    email: z.string().min(1, tv("emailRequired")).email(tv("emailInvalid")),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormData) => {
    try {
      await apiClient.post("/auth/forgot-password", data);
      toast.success(t("toasts.instructionsSent"));
      router.push("/login");
    } catch {
      // Always show success to prevent email enumeration.
      toast.success(t("toasts.instructionsSentIfExists"));
      router.push("/login");
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-white font-sans text-black">
      <AnimatedHalftone />

      <div className="absolute left-6 top-6 z-30">
        <Link href="/" className="inline-block transition-opacity hover:opacity-80">
          <Image
            src="/assets/logos/warptalk-sidebar-logo.png"
            alt="WarpTalk"
            width={100}
            height={24}
            className="h-6 w-auto object-contain mix-blend-multiply"
            priority
          />
        </Link>
      </div>

      <div className="absolute right-6 top-6 z-30">
        <LanguageSwitcher />
      </div>

      <div className="relative z-20 w-full max-w-[360px] px-4">
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-black">{t("heading")}</h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>

        {googleOffered ? (
          <div className="mb-4 space-y-4">
            {GOOGLE_CLIENT_ID ? <GoogleForgotButton /> : <GoogleUnavailableButton />}
            <div className="flex items-center gap-4 py-2">
              <div className="h-[1px] flex-1 bg-neutral-200" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                {t("or")}
              </span>
              <div className="h-[1px] flex-1 bg-neutral-200" />
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4" noValidate>
          <div className="space-y-2">
            <input
              type="email"
              autoComplete="email"
              autoFocus
              placeholder={t("emailPlaceholder")}
              className={cn(
                "h-14 w-full rounded-full border border-neutral-300 bg-white px-5 text-[15px] text-black outline-none transition-all placeholder:text-neutral-500 focus:border-black focus:ring-1 focus:ring-black",
                errors.email && "border-[#d92d20] focus:border-[#d92d20] focus:ring-[#d92d20]",
              )}
              {...register("email")}
            />
            {errors.email && (
              <div className="flex items-center gap-1.5 mt-1.5 text-[#d92d20]">
                <WarningCircle size={16} />
                <p className="text-[13px] font-medium">{errors.email.message}</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-14 w-full items-center justify-center rounded-full bg-black text-[15px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70"
          >
            {isSubmitting ? <Spinner weight="bold" className="animate-spin" /> : t("submit")}
          </button>
        </form>

        <p className="relative z-20 mt-6 text-center text-[13px] font-medium text-neutral-700">
          <span className="rounded-lg bg-white/70 px-2 py-1 backdrop-blur-md">
            {t("rememberPassword")}{" "}
            <Link href="/login" className="text-black hover:underline">
              {t("logIn")}
            </Link>
          </span>
        </p>

        <div className="relative z-20 mt-auto flex justify-center pb-6 pt-12">
          <div className="flex items-center gap-4 rounded-full border border-white/50 bg-white/70 px-4 py-1.5 text-[13px] font-medium text-neutral-700 shadow-sm backdrop-blur-md">
            <Link href="/terms" className="transition-colors hover:text-black hover:underline">
              {t("termsOfUse")}
            </Link>
            <span className="text-neutral-400">|</span>
            <Link href="/privacy" className="transition-colors hover:text-black hover:underline">
              {t("privacyPolicy")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
