"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  CinematicAuthShell,
  GoogleMark,
} from "@/components/auth/cinematic-auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";

const registerSchema = z
  .object({
    fullName: z.string().min(1, "Please enter your name"),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password needs at least 1 uppercase letter")
      .regex(/[0-9]/, "Password needs at least 1 number")
      .regex(/[^A-Za-z0-9]/, "Password needs at least 1 special character"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

function setAccessTokenCookie(accessToken: string, expiresAt: string) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  document.cookie = `access_token=${accessToken}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export default function RegisterPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      const res = await apiClient.post<AuthResponse>(API.auth.register, {
        email: data.email,
        password: data.password,
        fullName: data.fullName,
      });
      const { user, accessToken, refreshToken, expiresAt } = res.data;

      login(user, accessToken, refreshToken);
      setAccessTokenCookie(accessToken, expiresAt);

      toast.success("Registration successful!");
      router.replace("/dashboard");
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
    <CinematicAuthShell
      switchHref="/login"
      switchLabel="Sign in"
      switchText="Log in"
    >
      <div className="mb-5 text-center">
        <h1 className="text-[1.9rem] font-extrabold leading-tight tracking-tight text-black">
          Join WarpTalk
        </h1>
        <p className="mt-1 text-xs font-medium text-black/45">
          Create your account to start translating.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="mb-4 h-11 w-full gap-2 rounded-[7px] border-black/60 bg-white/30 text-sm font-medium text-black shadow-none hover:bg-white/60"
      >
        Sign up with
        <GoogleMark />
      </Button>

      <div className="mb-4 flex items-center gap-4">
        <div className="h-px flex-1 bg-black/25" />
        <span className="text-[0.65rem] font-medium text-black/45">Or</span>
        <div className="h-px flex-1 bg-black/25" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="fullName" className="sr-only">
            Full name
          </Label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <Input
              id="fullName"
              placeholder="Full name"
              autoComplete="name"
              className="h-10 rounded-[7px] border-black/55 bg-white/45 pl-11 text-sm text-black shadow-none placeholder:text-black/45 focus-visible:border-black focus-visible:ring-black/10"
              aria-invalid={Boolean(errors.fullName)}
              {...register("fullName")}
            />
          </div>
          {errors.fullName && (
            <p className="text-xs font-medium text-destructive">
              {errors.fullName.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
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
              className="h-10 rounded-[7px] border-black/55 bg-white/45 pl-11 text-sm text-black shadow-none placeholder:text-black/45 focus-visible:border-black focus-visible:ring-black/10"
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

        <div className="space-y-1">
          <Label htmlFor="password" className="sr-only">
            Password
          </Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              autoComplete="new-password"
              className="h-10 rounded-[7px] border-black/55 bg-white/45 px-11 text-sm text-black shadow-none placeholder:text-black/45 focus-visible:border-black focus-visible:ring-black/10"
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

        <div className="space-y-1">
          <Label htmlFor="confirmPassword" className="sr-only">
            Confirm password
          </Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm password"
              autoComplete="new-password"
              className="h-10 rounded-[7px] border-black/55 bg-white/45 pl-11 text-sm text-black shadow-none placeholder:text-black/45 focus-visible:border-black focus-visible:ring-black/10"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-xs font-medium text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="mt-4 h-12 w-full rounded-2xl bg-[#3f3f3f] text-sm font-semibold text-white shadow-[0_18px_34px_rgba(0,0,0,0.16)] hover:bg-black"
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-xs font-medium text-black/55">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-red-600 hover:text-red-700">
          Login
        </Link>
      </p>
    </CinematicAuthShell>
  );
}
