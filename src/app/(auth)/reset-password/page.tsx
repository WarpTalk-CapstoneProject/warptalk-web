"use client";

/**
 * WT-837 / WT-833: rebuilt to match the login/register white halftone design instead of the old
 * dark `CinematicAuthShell` — this page is reached mid auth-flow (forgot-password -> email link
 * -> here), so a visitor coming from the white pages hit a full-page theme flip.
 *
 * Also carries the missing-token case its own explicit copy: the old page just disabled the
 * submit button with no explanation when `?token=` was absent, which is indistinguishable from a
 * dead button. /verify-email already tells the visitor a link is invalid; this page now does too.
 */

import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Spinner, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslations } from "next-intl";

import { AnimatedHalftone } from "@/components/auth/animated-halftone";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import apiClient from "@/lib/api/client";
import { cn } from "@/lib/utils";

type FormData = { password: string; confirmPassword: string };

function AuthShell({ children }: { children: React.ReactNode }) {
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

      <div className="relative z-20 w-full max-w-[360px] px-4">{children}</div>
    </div>
  );
}

function Footer({ t }: { t: ReturnType<typeof useTranslations<"auth.resetPassword">> }) {
  return (
    <>
      <p className="relative z-20 mt-6 text-center text-[13px] font-medium text-neutral-700">
        <span className="rounded-lg bg-white/70 px-2 py-1 backdrop-blur-md">
          <Link href="/login" className="text-black hover:underline">
            {t("backToLogin")}
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
    </>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    "h-14 w-full rounded-full border border-neutral-300 bg-white px-5 text-[15px] text-black outline-none transition-all placeholder:text-neutral-500 focus:border-black focus:ring-1 focus:ring-black",
    hasError && "border-[#d92d20] focus:border-[#d92d20] focus:ring-[#d92d20]",
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[#d92d20]">
      <WarningCircle size={16} />
      <p className="text-[13px] font-medium">{message}</p>
    </div>
  );
}

function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const tv = useTranslations("validation");
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();

  const schema = z
    .object({
      password: z.string().min(8, tv("passwordMin8")),
      confirmPassword: z.string(),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ["confirmPassword"],
      message: tv("passwordsDoNotMatch"),
    });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await apiClient.post("/auth/reset-password", { token, newPassword: data.password });
      toast.success(t("toasts.success"));
      router.push("/login");
    } catch {
      toast.error(t("toasts.invalidOrExpired"));
    }
  };

  // WT-833: a missing token used to fall through to this same form with the submit button quietly
  // disabled — nothing told the visitor the link itself was the problem. Every other broken-token
  // page in this flow (/verify-email) says so up front; this one now does too. Checked after the
  // hooks above (not as an early return before them) so they run in the same order every render.
  if (!token) {
    return (
      <AuthShell>
        <div className="mb-8 flex flex-col items-center text-center">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-black">
            {t("invalidLinkHeading")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("invalidLinkDetail")}</p>
        </div>
        <Link
          href="/forgot-password"
          className="flex h-14 w-full items-center justify-center rounded-full bg-black text-[15px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99]"
        >
          {t("requestNewLink")}
        </Link>
        <Footer t={t} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-8 flex flex-col items-center text-center">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-black">{t("heading")}</h1>
        <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4" noValidate>
        <div className="space-y-2">
          <input
            type="password"
            autoComplete="new-password"
            autoFocus
            placeholder={t("newPasswordPlaceholder")}
            className={inputClass(Boolean(errors.password))}
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </div>

        <div className="space-y-2">
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("confirmPasswordPlaceholder")}
            className={inputClass(Boolean(errors.confirmPassword))}
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-14 w-full items-center justify-center rounded-full bg-black text-[15px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70"
        >
          {isSubmitting ? <Spinner weight="bold" className="animate-spin" /> : t("submit")}
        </button>
      </form>

      <Footer t={t} />
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-20 grid place-items-center bg-white">
          <Spinner weight="bold" className="animate-spin text-black" size={32} />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
