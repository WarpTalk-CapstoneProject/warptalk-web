"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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

function setAccessTokenCookie(accessToken: string, expiresAt: string) {
  const expiresTime = new Date(expiresAt).getTime();
  const currentTime = new Date().getTime();
  const maxAge = Math.max(0, Math.floor((expiresTime - currentTime) / 1000));

  globalThis.document.cookie = `access_token=${accessToken}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function TicketShard({
  className,
  delay = "0s",
}: {
  className?: string;
  delay?: string;
}) {
  return (
    <div
      className={`absolute overflow-hidden rounded-[2rem] border border-white/50 bg-[linear-gradient(135deg,rgba(255,255,255,0.75),rgba(99,132,255,0.82)_42%,rgba(184,80,255,0.55)_68%,rgba(47,79,255,0.88))] shadow-[0_0_28px_rgba(118,151,255,0.55),inset_0_0_18px_rgba(255,255,255,0.52)] motion-safe:animate-float ${className}`}
      style={{
        animationDelay: delay,
        clipPath:
          "polygon(12% 8%, 86% 8%, 94% 28%, 82% 39%, 98% 57%, 90% 83%, 62% 79%, 50% 96%, 31% 78%, 8% 84%, 4% 58%, 19% 43%, 4% 27%)",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_22%,rgba(255,255,255,0.95),transparent_26%),radial-gradient(circle_at_72%_18%,rgba(96,219,255,0.6),transparent_24%),linear-gradient(120deg,transparent_28%,rgba(255,255,255,0.78)_44%,transparent_58%)]" />
      <div className="absolute -inset-y-10 -left-1/2 w-1/2 rotate-12 bg-white/30 blur-xl animate-sweep" />
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const login = useAuthStore((s) => s.login);

  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await apiClient.post<AuthResponse>(API.auth.login, data);
      const { user, accessToken, refreshToken, expiresAt } = res.data;

      login(user, accessToken, refreshToken);
      setAccessTokenCookie(accessToken, expiresAt);

      toast.success("Login successful!");
      router.push(callbackUrl);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Login failed. Please try again."
      );
    }
  };

  return (
    <main className="fixed inset-0 z-20 overflow-y-auto bg-[#d5d5d3] px-4 py-6 text-[#151324] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-full w-full max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[1.75rem] border border-white/80 bg-white shadow-[0_28px_90px_rgba(28,28,28,0.18)] lg:min-h-[36rem] lg:grid-cols-[1fr_1.04fr]">
          <div className="relative flex min-h-[36rem] flex-col bg-white px-6 py-6 sm:px-10 lg:px-12">
            <div className="flex items-start justify-between gap-4">
              <Link
                href="/"
                aria-label="Go to WarpTalk home"
                className="size-8 rounded-full bg-[#403a91] shadow-[0_12px_24px_rgba(64,58,145,0.24)] transition-transform hover:scale-105"
              />
              <div className="flex items-center gap-3 text-[0.8rem] text-[#585666]">
                <span className="hidden sm:inline">
                  Don&apos;t have an account?
                </span>
                <Link
                  href="/register"
                  className="rounded-md border border-[#edeaf4] bg-white px-3 py-1.5 font-medium text-[#302d44] shadow-sm transition-colors hover:border-[#cbc5ef] hover:text-[#403a91]"
                >
                  Register
                </Link>
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-[21rem] flex-1 flex-col justify-center py-7">
              <div className="mb-5 flex justify-center">
                <div className="grid size-16 place-items-center rounded-full bg-[#f6f5f8] shadow-[inset_0_0_0_10px_rgba(255,255,255,0.85),0_16px_32px_rgba(38,35,64,0.08)]">
                  <UserRound
                    className="h-7 w-7 text-[#242233]"
                    strokeWidth={1.7}
                  />
                </div>
              </div>

              <div className="mb-5 text-center">
                <h1 className="text-[1.7rem] font-semibold leading-tight tracking-normal text-[#12101e]">
                  Login to your account
                </h1>
                <p className="mt-1 text-sm text-[#777482]">
                  Enter your details to login.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-2 rounded-md border-[#eceaf0] bg-white text-[0.82rem] font-semibold text-[#1d1a2d] shadow-sm hover:bg-[#faf9fd]"
              >
                <GoogleMark />
                Continue with Google
              </Button>

              <div className="my-4 flex items-center gap-4">
                <div className="h-px flex-1 bg-[#eeedf2]" />
                <span className="text-[0.68rem] font-medium uppercase text-[#aaa6b2]">
                  Or
                </span>
                <div className="h-px flex-1 bg-[#eeedf2]" />
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-[0.78rem] font-semibold text-[#292638]"
                  >
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a9a5b3]" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="hello@example.com"
                      autoComplete="email"
                      className="h-10 rounded-md border-[#e8e5ec] bg-white pl-9 text-sm shadow-sm placeholder:text-[#bbb6c2] focus-visible:border-[#655bc2] focus-visible:ring-[#655bc2]/15"
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

                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-[0.78rem] font-semibold text-[#292638]"
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a9a5b3]" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="**********"
                      autoComplete="current-password"
                      className="h-10 rounded-md border-[#e8e5ec] bg-white px-9 text-sm shadow-sm placeholder:text-[#bbb6c2] focus-visible:border-[#655bc2] focus-visible:ring-[#655bc2]/15"
                      aria-invalid={Boolean(errors.password)}
                      {...register("password")}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center text-[#8d8999] transition-colors hover:text-[#403a91]"
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

                <div className="flex items-center justify-between gap-4 pt-1">
                  <label className="flex items-center gap-2 text-[0.78rem] font-medium text-[#5c5868]">
                    <Checkbox className="size-3.5 rounded-[3px] border-[#dfdce5] data-checked:border-[#403a91] data-checked:bg-[#403a91]" />
                    Keep me logged in
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-[0.78rem] font-medium text-[#4b465f] underline underline-offset-2 transition-colors hover:text-[#403a91]"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="mt-1 h-11 w-full rounded-md bg-[linear-gradient(180deg,#6d64bf,#463d97)] text-[0.84rem] font-semibold text-white shadow-[0_14px_24px_rgba(70,61,151,0.28)] transition-transform hover:translate-y-[-1px] hover:bg-[linear-gradient(180deg,#756bca,#4d43a4)]"
                  disabled={isSubmitting}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Login
                </Button>
              </form>
            </div>

            <div className="flex items-center justify-between gap-4 text-[0.78rem] text-[#777482]">
              <span>(c) 2026 WarpTalk</span>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md px-1 py-1 font-medium transition-colors hover:text-[#403a91]"
                aria-label="Language selector"
              >
                <Globe2 className="h-3.5 w-3.5" />
                ENG
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <aside className="relative hidden min-h-[36rem] overflow-hidden rounded-[1.5rem] border border-white/75 bg-[#24236f] p-8 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_74%,rgba(118,145,255,0.55),transparent_26%),radial-gradient(circle_at_34%_78%,rgba(245,96,213,0.5),transparent_24%),linear-gradient(146deg,#2b2b82_0%,#4139a2_48%,#151449_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.16),transparent_27%,rgba(255,255,255,0.08)_60%,transparent_80%)] opacity-75" />
            <div className="absolute -right-12 bottom-10 h-64 w-64 rounded-full bg-[#090827]/75 blur-sm" />
            <div className="absolute bottom-[-10%] left-[-10%] h-64 w-64 rounded-full bg-[#604cf6]/40 blur-3xl" />

            <TicketShard className="right-[6%] top-[34%] h-64 w-44 rotate-[10deg]" />
            <TicketShard
              className="right-[32%] top-[42%] h-56 w-40 rotate-[-28deg]"
              delay="-1.8s"
            />
            <TicketShard
              className="right-[-12%] top-[44%] h-60 w-40 rotate-[24deg]"
              delay="-3.2s"
            />

            <div className="relative z-10">
              <div className="mb-5 grid size-11 place-items-center rounded-xl bg-white/92 text-[#433c98] shadow-[0_16px_36px_rgba(255,255,255,0.18)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-normal">WARPTALK</h2>
              <p className="mt-2 text-base font-medium text-white/82">
                Real-time conversations, translated with clarity.
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-9 text-sm">
              <div>
                <h3 className="font-semibold text-white">Get Access</h3>
                <p className="mt-3 max-w-[12rem] leading-6 text-white/68">
                  Sign up at warptalk.app to start using the app.
                </p>
              </div>
              <div className="border-l border-white/18 pl-8">
                <h3 className="font-semibold text-white">Questions?</h3>
                <p className="mt-3 max-w-[13rem] leading-6 text-white/68">
                  Reach us at support@warptalk.app or call +84 28 0000 404.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-20 grid place-items-center bg-[#d5d5d3]">
          <Loader2 className="h-6 w-6 animate-spin text-[#403a91]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
