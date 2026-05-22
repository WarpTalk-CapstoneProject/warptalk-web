"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  CinematicAuthShell,
  GoogleAuthIcon,
  InputGroup,
  SocialButton,
} from "@/components/auth/cinematic-auth-shell";
import apiClient from "@/lib/api/client";

const forgotSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormData) => {
    try {
      // TODO: Backend forgot-password endpoint not yet implemented.
      await apiClient.post("/auth/forgot-password", data);
      toast.success("Password reset instructions have been sent.");
      router.push("/login");
    } catch {
      // Always show success to prevent email enumeration.
      toast.success("If that email exists, reset instructions will be sent.");
      router.push("/login");
    }
  };

  return (
    <CinematicAuthShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-medium tracking-tight">Recover Account</h1>
        <p className="text-sm text-white/40">
          Enter your email and we will send reset instructions.
        </p>
      </div>

      <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

        <button
          type="submit"
          className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-white font-semibold text-black transition hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Loader2 className="animate-spin" /> : "Send Reset Email"}
        </button>
      </form>

      <p className="text-center text-sm text-white/40">
        Remember your password?{" "}
        <Link href="/login" className="font-medium text-white hover:underline">
          Log in
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
