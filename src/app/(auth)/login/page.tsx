"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeClosed, Spinner } from "@phosphor-icons/react/dist/ssr";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  CinematicAuthShell,
  GoogleAuthIcon,
  InputGroup,
  SocialButton,
} from "@/components/auth/cinematic-auth-shell";
import { Checkbox } from "@/components/ui/checkbox";
import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

function getSafeCallbackUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/workspace/dashboard";
  return value;
}

function setAccessTokenCookie(accessToken: string) {
  // Save for 7 days (604800 seconds) so middleware doesn't kick user out
  const maxAge = 7 * 24 * 60 * 60;
  document.cookie = `access_token=${accessToken}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl") || searchParams.get("redirect"));
  const login = useAuthStore((s) => s.login);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasSensitiveParams = url.searchParams.has("email") || url.searchParams.has("password");

    if (hasSensitiveParams) {
      url.searchParams.delete("email");
      url.searchParams.delete("password");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await apiClient.post<AuthResponse>(API.auth.login, data);
      const { user, accessToken, refreshToken, expiresAt } = res.data;

      login(user, accessToken, refreshToken);
      setAccessTokenCookie(accessToken);

      toast.success("Login successful!");
      
      const isAdmin = user.roles?.some((r: string) => r.toLowerCase() === "admin");
      if (isAdmin && callbackUrl === "/workspace/dashboard") {
        router.replace("/internal/dashboard");
      } else {
        router.replace(callbackUrl);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Login failed. Please try again."
      );
    }
  };

  return (
    <CinematicAuthShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">Welcome Back</h1>
        <p className="text-sm text-white/40">
          Log in to continue configuring your WarpTalk space.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <InputGroup
            label="Email"
            placeholder="name@domain.com"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          {errors.email && (
            <p className="mt-2 text-xs text-white/50">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-white">Password</span>
            <span className="relative block">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                autoComplete="current-password"
                className="h-11 w-full rounded-xl border-none bg-brand-gray px-4 pr-12 text-white outline-none placeholder:text-white/20 focus:ring-2 focus:ring-white/20"
                aria-invalid={Boolean(errors.password)}
                {...register("password")}
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeClosed weight="light" /> : <Eye weight="light" />}
              </button>
            </span>
          </label>
          {errors.password && (
            <p className="text-xs text-white/50">{errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-xs font-medium text-white/40">
            <Checkbox className="size-3.5 border-white/20 bg-brand-gray data-checked:border-white data-checked:bg-white data-checked:text-black" />
            Keep me logged in
          </label>
          <Link href="/forgot-password" className="text-xs font-medium text-white hover:underline">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-white font-semibold text-black transition hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Spinner weight="light" className="animate-spin" /> : "Log In"}
        </button>
      </form>

      <p className="text-center text-sm text-white/40">
        New to WarpTalk?{" "}
        <Link href="/register" className="font-medium text-white hover:underline">
          Create account
        </Link>
      </p>

      <div className="relative">
        <div className="border-t border-white/10" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-black px-4 text-xs font-medium uppercase tracking-widest text-white/40">
          Or
        </span>
      </div>

      <SocialButton icon={<GoogleAuthIcon />} label="Google" />
    </CinematicAuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-20 grid place-items-center bg-black">
          <Spinner weight="light" className="animate-spin text-white" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
