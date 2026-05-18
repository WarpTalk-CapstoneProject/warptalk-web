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

function GlassTicketScene() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 620 460"
      className="absolute bottom-[-8px] right-[-34px] z-[1] h-[74%] w-[84%] overflow-visible"
    >
      <defs>
        <linearGradient id="ticketFillA" x1="76" x2="300" y1="76" y2="290">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.58" />
          <stop offset="0.24" stopColor="#bde9ff" stopOpacity="0.7" />
          <stop offset="0.52" stopColor="#437cff" stopOpacity="0.92" />
          <stop offset="1" stopColor="#244cff" stopOpacity="0.82" />
        </linearGradient>
        <linearGradient id="ticketFillB" x1="330" x2="540" y1="20" y2="300">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.62" />
          <stop offset="0.32" stopColor="#98e8ff" stopOpacity="0.75" />
          <stop offset="0.68" stopColor="#315bff" stopOpacity="0.94" />
          <stop offset="1" stopColor="#2846da" stopOpacity="0.86" />
        </linearGradient>
        <linearGradient id="shine" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.47" stopColor="#ffffff" stopOpacity="0.92" />
          <stop offset="0.54" stopColor="#9ff7ff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="whiteHotspot" cx="32%" cy="29%" r="34%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.72" />
          <stop offset="0.22" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g opacity="0.98">
        <path
          d="M96 214 L253 126 L308 176 L294 224 L354 257 L357 369 L292 337 L238 386 L190 316 L111 278 Z"
          fill="#4d6dff"
          opacity="0.28"
          transform="translate(0 10)"
        />
        <path
          d="M96 214 L253 126 L308 176 L294 224 L354 257 L357 369 L292 337 L238 386 L190 316 L111 278 Z"
          fill="url(#ticketFillA)"
          className="motion-safe:animate-float"
          style={{ animationDuration: "7.5s" }}
        />
        <path
          d="M96 214 L253 126 L308 176 L294 224 L354 257 L357 369 L292 337 L238 386 L190 316 L111 278 Z"
          fill="none"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="3"
        />
        <path
          d="M185 150 L238 386"
          stroke="url(#shine)"
          strokeLinecap="round"
          strokeWidth="17"
          opacity="0.64"
        />
        <ellipse cx="161" cy="237" fill="url(#whiteHotspot)" rx="57" ry="62" />
      </g>

      <g opacity="0.98">
        <path
          d="M342 68 L526 98 L534 173 L494 222 L520 292 L430 374 L384 278 L314 295 L328 202 L300 139 Z"
          fill="#274eff"
          opacity="0.3"
          transform="translate(0 12)"
        />
        <path
          d="M342 68 L526 98 L534 173 L494 222 L520 292 L430 374 L384 278 L314 295 L328 202 L300 139 Z"
          fill="url(#ticketFillB)"
          className="motion-safe:animate-float"
          style={{ animationDelay: "-2.2s", animationDuration: "8.4s" }}
        />
        <path
          d="M342 68 L526 98 L534 173 L494 222 L520 292 L430 374 L384 278 L314 295 L328 202 L300 139 Z"
          fill="none"
          stroke="rgba(255,255,255,0.76)"
          strokeWidth="3.4"
        />
        <path
          d="M494 98 L340 292"
          stroke="url(#shine)"
          strokeLinecap="round"
          strokeWidth="20"
          opacity="0.72"
        />
        <ellipse cx="394" cy="145" fill="url(#whiteHotspot)" rx="74" ry="78" />
      </g>

      <g opacity="0.82">
        <path
          d="M550 146 L635 182 L618 267 L652 315 L585 378 L522 334 L488 352 L510 248 L486 202 Z"
          fill="#4d6dff"
          opacity="0.24"
          transform="translate(0 12)"
        />
        <path
          d="M550 146 L635 182 L618 267 L652 315 L585 378 L522 334 L488 352 L510 248 L486 202 Z"
          fill="url(#ticketFillA)"
          className="motion-safe:animate-float"
          style={{ animationDelay: "-3.6s", animationDuration: "8.8s" }}
        />
        <path
          d="M550 146 L635 182 L618 267 L652 315 L585 378 L522 334 L488 352 L510 248 L486 202 Z"
          fill="none"
          stroke="rgba(255,255,255,0.64)"
          strokeWidth="3"
        />
        <path
          d="M620 170 L500 336"
          stroke="url(#shine)"
          strokeLinecap="round"
          strokeWidth="17"
          opacity="0.6"
        />
      </g>
    </svg>
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
    <main className="fixed inset-0 z-20 overflow-y-auto bg-[#d2d2d0] px-4 py-6 text-[#151324] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-full w-full max-w-[980px] items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[1.1rem] border border-white/85 bg-white shadow-[0_26px_82px_rgba(25,25,30,0.2)] lg:min-h-[600px] lg:grid-cols-[1fr_1fr]">
          <div className="relative flex min-h-[600px] flex-col bg-white px-6 py-6 sm:px-8 lg:px-[28px]">
            <div className="flex items-start justify-between gap-4">
              <Link
                href="/"
                aria-label="Go to WarpTalk home"
                className="size-[27px] rounded-full bg-[#403a91] shadow-[0_12px_24px_rgba(64,58,145,0.22)] transition-transform hover:scale-105"
              />
              <div className="flex items-center gap-3 text-[0.55rem] text-[#403d4b]">
                <span className="hidden sm:inline">
                  Don&apos;t have an account?
                </span>
                <Link
                  href="/register"
                  className="rounded-[4px] border border-[#eeeaf3] bg-white px-2.5 py-1 font-medium text-[#332f42] shadow-[0_4px_10px_rgba(22,18,46,0.06)] transition-colors hover:border-[#cbc5ef] hover:text-[#403a91]"
                >
                  Register
                </Link>
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-[270px] flex-1 flex-col justify-center pb-10 pt-7">
              <div className="mb-4 flex justify-center">
                <div className="grid size-[54px] place-items-center rounded-full bg-[#f6f5f8] shadow-[inset_0_0_0_9px_rgba(255,255,255,0.9),0_15px_32px_rgba(38,35,64,0.07)]">
                  <UserRound
                    className="h-[22px] w-[22px] text-[#242233]"
                    strokeWidth={1.7}
                  />
                </div>
              </div>

              <div className="mb-[18px] text-center">
                <h1 className="text-[1.08rem] font-semibold leading-tight tracking-normal text-[#12101e]">
                  Login to your account
                </h1>
                <p className="mt-1 text-[0.72rem] text-[#777482]">
                  Enter your details to login.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-[28px] w-full gap-1.5 rounded-[4px] border-[#eceaf0] bg-white text-[0.62rem] font-semibold text-[#1d1a2d] shadow-[0_2px_7px_rgba(21,17,43,0.08)] hover:bg-[#faf9fd] [&_svg]:size-3"
              >
                <GoogleMark />
                Continue with Google
              </Button>

              <div className="my-[14px] flex items-center gap-4">
                <div className="h-px flex-1 bg-[#eeedf2]" />
                <span className="text-[0.5rem] font-medium uppercase text-[#aaa6b2]">
                  Or
                </span>
                <div className="h-px flex-1 bg-[#eeedf2]" />
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-[0.62rem] font-semibold text-[#292638]"
                  >
                    Email Address*
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a9a5b3]" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="hello@example.com"
                      autoComplete="email"
                      className="h-[29px] rounded-[4px] border-[#e8e5ec] bg-white pl-8 text-[0.66rem] shadow-[0_2px_8px_rgba(25,20,50,0.04)] placeholder:text-[#bbb6c2] focus-visible:border-[#655bc2] focus-visible:ring-[#655bc2]/15"
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
                  <Label
                    htmlFor="password"
                    className="text-[0.62rem] font-semibold text-[#292638]"
                  >
                    Password*
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a9a5b3]" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="**********"
                      autoComplete="current-password"
                      className="h-[29px] rounded-[4px] border-[#e8e5ec] bg-white px-8 text-[0.66rem] shadow-[0_2px_8px_rgba(25,20,50,0.04)] placeholder:text-[#bbb6c2] focus-visible:border-[#655bc2] focus-visible:ring-[#655bc2]/15"
                      aria-invalid={Boolean(errors.password)}
                      {...register("password")}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center text-[#8d8999] transition-colors hover:text-[#403a91]"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
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
                  <label className="flex items-center gap-1.5 text-[0.62rem] font-medium text-[#5c5868]">
                    <Checkbox className="size-3 rounded-[3px] border-[#dfdce5] data-checked:border-[#403a91] data-checked:bg-[#403a91]" />
                    Keep me logged in
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-[0.62rem] font-medium text-[#4b465f] underline underline-offset-2 transition-colors hover:text-[#403a91]"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="mt-0.5 h-[31px] w-full rounded-[4px] bg-[linear-gradient(180deg,#645bc0,#403895)] text-[0.62rem] font-semibold text-white shadow-[0_14px_26px_rgba(70,61,151,0.24)] transition-transform hover:translate-y-[-1px] hover:bg-[linear-gradient(180deg,#7066cd,#4a40a2)]"
                  disabled={isSubmitting}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Login
                </Button>
              </form>
            </div>

            <div className="flex items-center justify-between gap-4 text-[0.62rem] text-[#777482]">
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

          <aside className="relative hidden min-h-[590px] overflow-hidden rounded-[0.95rem] border border-white/75 bg-[#24236f] p-8 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_64%,rgba(89,135,255,0.5),transparent_24%),radial-gradient(circle_at_37%_82%,rgba(234,88,212,0.52),transparent_25%),radial-gradient(circle_at_18%_18%,rgba(112,145,255,0.22),transparent_20%),linear-gradient(148deg,#282777_0%,#3e39a0_49%,#111241_100%)]" />
            <div className="absolute inset-0 opacity-[0.14] [background-image:radial-gradient(rgba(255,255,255,0.5)_0.45px,transparent_0.45px)] [background-size:2.5px_2.5px]" />
            <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.13),transparent_28%,rgba(255,255,255,0.06)_58%,transparent_82%)] opacity-80" />
            <div className="absolute -right-12 bottom-8 z-[2] h-44 w-44 rounded-full bg-[#090827]/82 blur-[2px]" />
            <div className="absolute bottom-[-16%] left-[-14%] z-0 h-72 w-72 rounded-full bg-[#3159ff]/46 blur-[34px]" />
            <div className="absolute bottom-[4%] left-[8%] z-0 h-56 w-56 rounded-full bg-[#ff55dc]/28 blur-[42px]" />
            <div className="absolute bottom-[8%] left-[-5%] z-[1] h-20 w-80 rotate-[-18deg] bg-[linear-gradient(90deg,transparent,rgba(91,152,255,0.62),rgba(255,108,226,0.45),transparent)] blur-[12px]" />
            <GlassTicketScene />

            <div className="relative z-10">
              <div className="mb-5 size-8 rounded-[8px] bg-white/90 shadow-[0_16px_36px_rgba(255,255,255,0.16)]" />
              <h2 className="text-[1.15rem] font-extrabold tracking-normal">WARPTALK</h2>
              <p className="mt-2 text-[0.82rem] font-medium text-white/78">
                Real-time conversations, translated with clarity.
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-8 text-[0.72rem]">
              <div>
                <h3 className="font-semibold text-white">Get Access</h3>
                <p className="mt-2.5 max-w-[10rem] leading-5 text-white/62">
                  Sign up at warptalk.app to start using the app.
                </p>
              </div>
              <div className="border-l border-white/18 pl-8">
                <h3 className="font-semibold text-white">Questions?</h3>
                <p className="mt-2.5 max-w-[11rem] leading-5 text-white/62">
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
