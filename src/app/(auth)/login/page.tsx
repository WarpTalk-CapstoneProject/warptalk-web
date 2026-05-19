"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  CinematicAuthShell,
  GoogleMark,
} from "@/components/auth/cinematic-auth-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function setAccessTokenCookie(accessToken: string, expiresAt: string) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
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

    if (!hasSensitiveParams) return;

    url.searchParams.delete("email");
    url.searchParams.delete("password");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await apiClient.post<AuthResponse>(API.auth.login, data);
      const { user, accessToken, refreshToken, expiresAt } = res.data;

      login(user, accessToken, refreshToken);
      setAccessTokenCookie(accessToken, expiresAt);

      toast.success("Login successful!");
      router.replace(callbackUrl);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Login failed. Please try again."
      );
    }
  };

  return (
    <CinematicAuthShell
      switchHref="/register"
      switchLabel="Sign up"
      switchText="Join us"
    >
      <div className="mb-6 flex justify-center">
        <div className="relative grid size-[5.1rem] place-items-center overflow-hidden rounded-full border border-white/60 bg-black/10 shadow-[0_18px_35px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_20%,rgba(255,255,255,0.7),transparent_38%)]" />
          <UserRound className="relative h-8 w-8 text-black/75" strokeWidth={1.7} />
        </div>
      </div>

      <div className="mb-6 text-center">
        <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight text-black">
          Hi Designer!
        </h1>
        <p className="mt-1 text-xs font-medium text-black/45">
          Welcome to WarpTalk.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="sr-only">
            Email
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <Input
              id="email"
              type="email"
              placeholder="Email"
              autoComplete="email"
              className="h-11 rounded-[7px] border-black/55 bg-white/45 pl-11 text-sm text-black shadow-none placeholder:text-black/45 focus-visible:border-black focus-visible:ring-black/10"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p className="text-xs font-medium text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="sr-only">
            Password
          </Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              autoComplete="current-password"
              className="h-11 rounded-[7px] border-black/55 bg-white/45 px-11 text-sm text-black shadow-none placeholder:text-black/45 focus-visible:border-black focus-visible:ring-black/10"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-black/45 transition-colors hover:text-black"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs font-medium text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 pt-0.5">
          <label className="flex items-center gap-2 text-xs font-medium text-black/55">
            <Checkbox className="size-3.5 rounded-[3px] border-black/25 data-checked:border-black data-checked:bg-black" />
            Keep me logged in
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-red-600 hover:text-red-700"
          >
            Forgot password?
          </Link>
        </div>

        <div className="flex items-center gap-4 py-1">
          <div className="h-px flex-1 bg-black/25" />
          <span className="text-[0.65rem] font-medium text-black/45">Or</span>
          <div className="h-px flex-1 bg-black/25" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2 rounded-[7px] border-black/60 bg-white/30 text-sm font-medium text-black shadow-none hover:bg-white/60"
        >
          Login with
          <GoogleMark />
        </Button>

        <Button
          type="submit"
          className="mt-5 h-12 w-full rounded-2xl bg-[#3f3f3f] text-sm font-semibold text-white shadow-[0_18px_34px_rgba(0,0,0,0.16)] hover:bg-black"
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Login
        </Button>
      </form>

      <p className="mt-4 text-center text-xs font-medium text-black/55">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-red-600 hover:text-red-700">
          Sign up
        </Link>
      </p>
    </CinematicAuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-20 grid place-items-center bg-black">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
