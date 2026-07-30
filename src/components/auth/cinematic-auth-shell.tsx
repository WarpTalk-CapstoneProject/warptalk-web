"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import type { Variants } from "motion/react";

import { cn } from "@/lib/utils";

const AUTH_VIDEO_URL =
  "/assets/videos/auth-investor-deck.mp4";

const leftContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
} satisfies Variants;

const leftItem = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
} satisfies Variants;

export function GoogleMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
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

export function GoogleAuthIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.9h5.35c-.25 1.45-1.61 4.26-5.35 4.26A6.15 6.15 0 0 1 5.85 12 6.15 6.15 0 0 1 12 5.74c1.84 0 3.08.78 3.79 1.46l2.58-2.49C16.72 3.17 14.58 2.25 12 2.25A9.75 9.75 0 1 0 12 21.75c5.62 0 9.35-3.95 9.35-9.51 0-.64-.07-1.13-.15-1.14h.15Z"
      />
    </svg>
  );
}

export function CinematicAuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen w-full bg-black p-2 text-white selection:bg-white/30 transition-all duration-500 lg:h-screen lg:overflow-hidden lg:p-4">
      <section className="relative hidden h-full w-[52%] flex-col items-center justify-end overflow-hidden rounded-3xl px-12 pb-32 shadow-2xl lg:flex">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={AUTH_VIDEO_URL} type="video/mp4" />
        </video>

        <motion.div
          variants={leftContainer}
          initial="hidden"
          animate="visible"
          className="z-10 flex w-full max-w-xs flex-col items-center text-center"
        >
          <motion.div variants={leftItem} className="flex flex-col items-center gap-6">
            <div className="grid size-28 place-items-center overflow-hidden rounded-3xl bg-black/55 shadow-2xl shadow-black/40">
              <Image
                src="/assets/logos/warptalk-icon-1k.jpg"
                alt="WarpTalk"
                width={112}
                height={112}
                className="size-28 scale-[3.15] object-cover invert mix-blend-screen"
                priority
              />
            </div>
            <h2 className="text-5xl font-semibold lowercase tracking-tight text-white drop-shadow-[0_2px_24px_rgba(255,255,255,0.28)]">
              warptalk
            </h2>
          </motion.div>
        </motion.div>
      </section>

      <section className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-12 sm:px-12 lg:overflow-hidden lg:px-16 lg:py-6 xl:px-24">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-xl space-y-8 sm:space-y-10 lg:space-y-6"
        >
          {children}
        </motion.div>
      </section>
    </main>
  );
}

export function StepItem({
  number,
  text,
  active = false,
}: {
  number: number;
  text: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium",
        active
          ? "border border-white bg-white text-black"
          : "border-none bg-brand-gray text-white"
      )}
    >
      <span
        className={cn(
          "grid size-7 place-items-center rounded-full text-xs",
          active ? "bg-black text-white" : "bg-white/10 text-white/40"
        )}
      >
        {number}
      </span>
      {text}
    </div>
  );
}

export function SocialButton({
  icon,
  label,
  className,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black text-sm font-medium text-white transition-colors hover:bg-white/5 cursor-pointer",
        className
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function InputGroup({
  label,
  placeholder,
  type,
  className,
  ...props
}: {
  label: string;
  placeholder: string;
  type: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-white">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        className={cn(
          "h-11 w-full rounded-xl border-none bg-brand-gray px-4 text-white outline-none placeholder:text-white/20 focus:ring-2 focus:ring-white/20",
          className
        )}
        {...props}
      />
    </label>
  );
}
