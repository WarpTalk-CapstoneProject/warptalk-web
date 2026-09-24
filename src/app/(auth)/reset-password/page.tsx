"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Spinner } from "@phosphor-icons/react/dist/ssr";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslations } from "next-intl";
import apiClient from "@/lib/api/client";
import { CinematicAuthShell, InputGroup } from "@/components/auth/cinematic-auth-shell";

type FormData = { password: string; confirmPassword: string };

function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const tv = useTranslations("validation");
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();

  const schema = z.object({
    password: z.string().min(8, tv("passwordMin8")),
    confirmPassword: z.string(),
  }).refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: tv("passwordsDoNotMatch"),
  });

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await apiClient.post("/auth/reset-password", { token, newPassword: data.password });
      toast.success(t("toasts.success"));
      router.push("/login");
    } catch {
      toast.error(t("toasts.invalidOrExpired"));
    }
  };

  return (
    <CinematicAuthShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">{t("heading")}</h1>
        <p className="text-sm text-white/40">{t("subtitle")}</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <InputGroup label={t("newPasswordLabel")} placeholder={t("newPasswordPlaceholder")} type="password" autoComplete="new-password" {...register("password")} />
        {errors.password && <p className="text-xs text-white/50">{errors.password.message}</p>}
        <InputGroup label={t("confirmPasswordLabel")} placeholder={t("confirmPasswordPlaceholder")} type="password" autoComplete="new-password" {...register("confirmPassword")} />
        {errors.confirmPassword && <p className="text-xs text-white/50">{errors.confirmPassword.message}</p>}
        <button type="submit" disabled={isSubmitting || !token} className="flex h-14 w-full items-center justify-center rounded-xl bg-white font-semibold text-black disabled:opacity-60">
          {isSubmitting ? <Spinner className="animate-spin" /> : t("submit")}
        </button>
      </form>
      <Link href="/login" className="text-center text-sm text-white/50 hover:text-white">{t("backToLogin")}</Link>
    </CinematicAuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
