"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeClosed, Spinner } from "@phosphor-icons/react/dist/ssr";
import { Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useGoogleLogin } from "@react-oauth/google";

import {
  CinematicAuthShell,
  GoogleAuthIcon,
  InputGroup,
  SocialButton,
} from "@/components/auth/cinematic-auth-shell";
import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { setAccessTokenCookie } from "@/lib/auth/session-cookie";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";

function getSafeCallbackUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value === "/rooms") return "/workspace";
  return value;
}

const getRegisterSchema = (hasToken: boolean) =>
  z.object({
    firstName: z.string().min(1, "Please enter your first name"),
    lastName: z.string().min(1, "Please enter your last name"),
    email: hasToken
      ? z.string().optional().or(z.literal(""))
      : z.string().min(1, "Email is required").email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 symbols"),
  });

type RegisterFormData = {
  firstName: string;
  lastName: string;
  email?: string;
  password: string;
};
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

function RegisterGoogleButton({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const idToken = tokenResponse.access_token;
        const res = await apiClient.post<AuthResponse>(API.auth.googleLogin, { idToken });
        const { user, accessToken, refreshToken, expiresAt } = res.data;

        login(user, accessToken, refreshToken);
        setAccessTokenCookie(accessToken, expiresAt);

        toast.success("Google sign-in successful!");
        router.replace(callbackUrl);
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } } };
        toast.error(error?.response?.data?.error || "Google sign-in failed. Please try again.");
      }
    },
    onError: () => {
      toast.error("Google authentication failed.");
    },
  });

  return (
    <SocialButton
      icon={<GoogleAuthIcon />}
      label="Google"
      onClick={() => handleGoogleLogin()}
    />
  );
}

function RegisterGoogleUnavailableButton() {
  return (
    <button
      type="button"
      disabled
      title="Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google sign-in."
      className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/10 bg-black text-sm font-medium text-white/35"
    >
      <GoogleAuthIcon />
      Google
    </button>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const hasToken = Boolean(token);
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl") || searchParams.get("redirect"));

  const login = useAuthStore((s) => s.login);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(getRegisterSchema(hasToken)) as Resolver<RegisterFormData>,
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      let res;
      if (hasToken) {
        res = await apiClient.post<AuthResponse>(API.auth.registerInvited, {
          token,
          password: data.password,
          fullName: `${data.firstName} ${data.lastName}`.trim(),
        });
      } else {
        res = await apiClient.post<AuthResponse>(API.auth.register, {
          email: data.email,
          password: data.password,
          fullName: `${data.firstName} ${data.lastName}`.trim(),
        });
      }

      const { user, accessToken, refreshToken, expiresAt } = res.data;

      login(user, accessToken, refreshToken);
      setAccessTokenCookie(accessToken, expiresAt);

      toast.success("Registration successful!");
      router.replace(callbackUrl);
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { error?: string } };
      };
      toast.error(
        error?.response?.data?.error ||
          "Registration failed. Please try again."
      );
    }
  };

  return (
    <CinematicAuthShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">Create New Profile</h1>
        <p className="text-sm text-white/40">
          {hasToken 
            ? "You've been invited! Enter your details to join the workspace."
            : "Input your basic details to begin the journey."}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <InputGroup
              label="First Name"
              placeholder="Warp"
              type="text"
              autoComplete="given-name"
              aria-invalid={Boolean(errors.firstName)}
              {...register("firstName")}
            />
            {errors.firstName && (
              <p className="mt-2 text-xs text-white/50">{errors.firstName.message}</p>
            )}
          </div>

          <div>
            <InputGroup
              label="Last Name"
              placeholder="Studio"
              type="text"
              autoComplete="family-name"
              aria-invalid={Boolean(errors.lastName)}
              {...register("lastName")}
            />
            {errors.lastName && (
              <p className="mt-2 text-xs text-white/50">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {!hasToken && (
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
        )}

        <div className="space-y-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-white">Password</span>
            <span className="relative block">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Create password"
                autoComplete="new-password"
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
          <p className="text-xs text-white/40">Requires at least 8 symbols.</p>
          {errors.password && (
            <p className="text-xs text-white/50">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-white font-semibold text-black transition hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Spinner weight="light" className="animate-spin" /> : "Create Account"}
        </button>
      </form>

      <p className="text-center text-sm text-white/40">
        Member of the team?{" "}
        <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-medium text-white hover:underline">
          Log in
        </Link>
      </p>

      <div className="relative">
        <div className="border-t border-white/10" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-black px-4 text-xs font-medium uppercase tracking-widest text-white/40">
          Or
        </span>
      </div>

      {GOOGLE_CLIENT_ID ? (
        <RegisterGoogleButton callbackUrl={callbackUrl} />
      ) : (
        <RegisterGoogleUnavailableButton />
      )}
    </CinematicAuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center"><Spinner weight="light" className="animate-spin text-white" size={32} /></div>}>
      <RegisterForm />
    </Suspense>
  );
}
