"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Spinner } from "@phosphor-icons/react/dist/ssr";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import apiClient from "@/lib/api/client";
import { CinematicAuthShell, InputGroup } from "@/components/auth/cinematic-auth-shell";

const schema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await apiClient.post("/auth/reset-password", { token, newPassword: data.password });
      toast.success("Password updated. You can sign in now.");
      router.push("/login");
    } catch {
      toast.error("This reset link is invalid or expired.");
    }
  };

  return (
    <CinematicAuthShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">Set a new password</h1>
        <p className="text-sm text-white/40">Choose a new password for your WarpTalk account.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <InputGroup label="New password" placeholder="Enter a new password" type="password" autoComplete="new-password" {...register("password")} />
        {errors.password && <p className="text-xs text-white/50">{errors.password.message}</p>}
        <InputGroup label="Confirm password" placeholder="Confirm your new password" type="password" autoComplete="new-password" {...register("confirmPassword")} />
        {errors.confirmPassword && <p className="text-xs text-white/50">{errors.confirmPassword.message}</p>}
        <button type="submit" disabled={isSubmitting || !token} className="flex h-14 w-full items-center justify-center rounded-xl bg-white font-semibold text-black disabled:opacity-60">
          {isSubmitting ? <Spinner className="animate-spin" /> : "Update password"}
        </button>
      </form>
      <Link href="/login" className="text-center text-sm text-white/50 hover:text-white">Back to login</Link>
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
