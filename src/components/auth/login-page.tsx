"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeClosed,
  Spinner,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useGoogleLogin } from "@react-oauth/google";

import { AnimatedHalftone } from "@/components/auth/animated-halftone";
import { GoogleAuthIcon } from "@/components/auth/cinematic-auth-shell";
import { Checkbox } from "@/components/ui/checkbox";
import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { setAccessTokenCookie } from "@/lib/auth/session-cookie";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

function getSafeCallbackUrl(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value === "/rooms"
  )
    return "/workspace";
  return value;
}

function GoogleLoginButton({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  // Nothing on this path may be written to the console. The Google access
  // token, and the AuthResponse the backend returns for it, both carry live
  // credentials. The toasts below are the user-facing signal; the console is
  // not a place to put credentials.
  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const idToken = tokenResponse.access_token;
        const res = await apiClient.post<AuthResponse>(API.auth.googleLogin, {
          idToken,
        });
        const { user, accessToken, expiresAt } = res.data;

        login(user, accessToken);
        setAccessTokenCookie(accessToken, expiresAt);

        toast.success("Google login successful!");

        const isAdmin = user.roles?.some(
          (r: string) => r.toLowerCase() === "admin",
        );
        if (isAdmin && callbackUrl === "/workspace/dashboard") {
          router.replace("/dashboard");
        } else {
          router.replace(callbackUrl);
        }
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } } };
        toast.error(
          error?.response?.data?.error ||
            "Google login failed. Please try again.",
        );
      }
    },
    onError: () => {
      toast.error("Google authentication failed or popup was closed.");
    },
  });

  return (
    <button
      type="button"
      onClick={() => handleGoogleLogin()}
      className="flex h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-neutral-300 bg-white text-[15px] font-medium text-black transition-colors hover:bg-neutral-50"
    >
      <GoogleAuthIcon className="size-5" />
      Continue with Google
    </button>
  );
}

function GoogleLoginUnavailableButton() {
  return (
    <button
      type="button"
      disabled
      title="Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google login."
      className="flex h-14 w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-neutral-200 bg-neutral-50 text-[15px] font-medium text-neutral-400"
    >
      <GoogleAuthIcon className="size-5" />
      Continue with Google
    </button>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(
    searchParams.get("callbackUrl") || searchParams.get("redirect"),
  );
  const login = useAuthStore((s) => s.login);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"email" | "password">("email");

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasSensitiveParams =
      url.searchParams.has("email") || url.searchParams.has("password");
    if (!hasSensitiveParams) return;
    url.searchParams.delete("email");
    url.searchParams.delete("password");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  const onSubmit = async (data: LoginFormData) => {
    if (step === "email") {
      const isEmailValid = await trigger("email");
      if (isEmailValid) {
        setStep("password");
      }
      return;
    }

    if (!data.password || data.password.length < 6) {
      setError("password", {
        message: "Password must be at least 6 characters",
      });
      return;
    }

    try {
      const res = await apiClient.post<AuthResponse>(API.auth.login, {
        email: data.email,
        password: data.password,
      });
      const { user, accessToken, expiresAt } = res.data;

      login(user, accessToken);
      setAccessTokenCookie(accessToken, expiresAt);

      toast.success("Login successful!");

      const isAdmin = user.roles?.some(
        (r: string) => r.toLowerCase() === "admin",
      );
      if (isAdmin && callbackUrl === "/workspace/dashboard") {
        router.replace("/dashboard");
      } else {
        router.replace(callbackUrl);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Login failed. Please try again.",
      );
    }
  };

  return (
    <div className="login-auth-page relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-white font-sans text-black">
      <AnimatedHalftone />

      <div className="absolute left-6 top-6 z-30">
        <Link
          href="/"
          className="inline-block transition-opacity hover:opacity-80"
        >
          <Image
            src="/assets/logos/warptalk-sidebar-logo.png"
            alt="WarpTalk"
            width={806}
            height={200}
            className="object-contain mix-blend-multiply"
            style={{ width: "auto", height: 24 }}
            priority
          />
        </Link>
      </div>

      <div className="relative z-20 w-full max-w-[360px] px-4">
        <div className="mb-10 flex flex-col items-center">
          <h1 className="mb-2 text-center text-3xl font-semibold tracking-tight text-black">
            Log in or sign up
          </h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="w-full" noValidate>
          <AnimatePresence mode="wait">
            {step === "email" ? (
              <motion.div
                key="email-step"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {GOOGLE_CLIENT_ID ? (
                  <GoogleLoginButton callbackUrl={callbackUrl} />
                ) : (
                  <GoogleLoginUnavailableButton />
                )}

                <div className="flex items-center gap-4 py-2">
                  <div className="h-px flex-1 bg-neutral-200" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                    Or
                  </span>
                  <div className="h-px flex-1 bg-neutral-200" />
                </div>

                <div className="space-y-2">
                  <input
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="Email address"
                    className={cn(
                      "login-auth-field h-14 w-full rounded-full border border-neutral-300 bg-white px-5 text-[15px] text-black outline-none transition-all placeholder:text-neutral-500 focus:border-black focus:ring-1 focus:ring-black",
                      errors.email &&
                        "border-[#d92d20] focus:border-[#d92d20] focus:ring-[#d92d20]",
                    )}
                    {...register("email")}
                  />
                  {errors.email && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[#d92d20]">
                      <WarningCircle size={16} />
                      <p className="text-[13px] font-medium">
                        {errors.email.message}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="flex h-14 w-full items-center justify-center rounded-full bg-black text-[15px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99]"
                >
                  Continue
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="password-step"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="relative mb-4 flex h-14 w-full items-center justify-between rounded-full border border-neutral-300 bg-white px-5">
                  <label className="absolute -top-2 left-4 bg-white px-1 text-[12px] font-normal text-neutral-500">
                    Email address
                  </label>
                  <span className="truncate pr-4 text-[15px] text-black">
                    {getValues("email")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep("email")}
                    className="whitespace-nowrap text-[15px] font-normal text-[#2563eb] hover:underline"
                  >
                    Edit
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="relative block">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      autoFocus
                      placeholder="Password"
                      className={cn(
                        "login-auth-field h-14 w-full rounded-full border border-neutral-300 bg-white px-5 pr-12 text-[15px] text-black outline-none transition-all placeholder:text-neutral-500 focus:border-black focus:ring-1 focus:ring-black",
                        errors.password &&
                          "border-[#d92d20] focus:border-[#d92d20] focus:ring-[#d92d20]",
                      )}
                      {...register("password")}
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors hover:text-black"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        <EyeClosed weight="regular" size={20} />
                      ) : (
                        <Eye weight="regular" size={20} />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[#d92d20]">
                      <WarningCircle size={16} />
                      <p className="text-[13px] font-medium">
                        {errors.password.message}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/70 px-2 py-1 text-[13px] font-medium text-neutral-800 backdrop-blur-md">
                    <Checkbox className="size-[14px] rounded-sm border-neutral-300 data-[state=checked]:bg-black data-[state=checked]:text-white" />
                    Keep me logged in
                  </label>
                  <Link
                    href="/forgot-password"
                    className="rounded-lg bg-white/70 px-2 py-1 text-[13px] font-medium text-neutral-800 backdrop-blur-md hover:text-black hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 flex h-14 w-full items-center justify-center rounded-full bg-black text-[15px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <Spinner weight="bold" className="animate-spin" />
                  ) : (
                    "Log In"
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        <p className="relative z-20 mt-6 text-center text-[13px] font-medium text-neutral-700">
          <span className="rounded-lg bg-white/70 px-2 py-1 backdrop-blur-md">
            New to WarpTalk?{" "}
            <Link
              href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="text-black hover:underline"
            >
              Create account
            </Link>
          </span>
        </p>

        <div className="relative z-20 mt-auto flex justify-center pb-6 pt-12">
          <div className="flex items-center gap-4 rounded-full border border-white/50 bg-white/70 px-4 py-1.5 text-[13px] font-medium text-neutral-700 shadow-sm backdrop-blur-md">
            <Link
              href="/terms"
              className="transition-colors hover:text-black hover:underline"
            >
              Terms of use
            </Link>
            <span className="text-neutral-400">|</span>
            <Link
              href="/privacy"
              className="transition-colors hover:text-black hover:underline"
            >
              Privacy policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-20 grid place-items-center bg-white">
          <Spinner
            weight="bold"
            className="animate-spin text-black"
            size={32}
          />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
