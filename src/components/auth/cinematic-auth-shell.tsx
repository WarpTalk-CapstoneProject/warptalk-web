"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Globe2, Sparkles } from "lucide-react";

const AUTH_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260419_064822_f120e48a-d545-45dd-a02d-facb07829888.mp4";

export function GoogleMark({ className = "h-4 w-4" }: { className?: string }) {
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

export function CinematicAuthShell({
  children,
  eyebrow = "Selected Works",
  switchLabel,
  switchHref,
  switchText,
}: {
  children: ReactNode;
  eyebrow?: string;
  switchLabel: string;
  switchHref: string;
  switchText: string;
}) {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const mediaClipId = `authMediaClip${useId().replace(/:/g, "")}`;
  const mediaClipStyle = {
    clipPath: `url(#${mediaClipId})`,
    WebkitClipPath: `url(#${mediaClipId})`,
  } satisfies CSSProperties;
  const pageVideoClassName = `absolute inset-0 z-0 h-full w-full object-cover object-[50%_44%] transition-opacity duration-700 ${
    isVideoReady ? "opacity-80" : "opacity-0"
  }`;
  const panelVideoClassName = `h-full w-full object-cover object-[50%_76%] transition-opacity duration-700 ${
    isVideoReady ? "opacity-100" : "opacity-0"
  }`;

  return (
    <main className="fixed inset-0 z-20 overflow-hidden bg-black px-4 py-6 text-[#111] sm:px-6 lg:px-8">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.2),transparent_22%),radial-gradient(circle_at_38%_70%,rgba(255,255,255,0.18),transparent_11%),linear-gradient(120deg,#030303_0%,#111_34%,#5f5f5f_47%,#181818_60%,#050505_100%)]" />
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onCanPlay={() => setIsVideoReady(true)}
        onLoadedData={() => setIsVideoReady(true)}
        className={pageVideoClassName}
      >
        <source src={AUTH_VIDEO_URL} type="video/mp4" />
      </video>
      <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.08),transparent_30%),linear-gradient(90deg,rgba(0,0,0,0.16),rgba(0,0,0,0.04)_45%,rgba(0,0,0,0.2))]" />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-6xl items-center justify-center">
        <section className="grid max-h-[calc(100dvh-3rem)] w-full overflow-y-auto rounded-[1.3rem] bg-white p-4 shadow-[0_30px_100px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,255,255,0.85)] lg:grid-cols-[1.03fr_0.97fr] lg:overflow-hidden">
          <aside className="relative hidden min-h-[36rem] overflow-hidden rounded-[1rem] text-white lg:block">
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute h-0 w-0"
              focusable="false"
            >
              <defs>
                <clipPath id={mediaClipId} clipPathUnits="objectBoundingBox">
                  <path d="M 0.03 0 Q 0 0 0 0.04 L 0 0.96 Q 0 1 0.03 1 L 0.78 1 Q 0.805 1 0.812 0.965 L 0.935 0.035 Q 0.94 0 0.91 0 Z" />
                </clipPath>
              </defs>
            </svg>
            <div
              className="absolute inset-x-0 bottom-4 top-0 overflow-hidden bg-[radial-gradient(circle_at_45%_22%,rgba(255,255,255,0.28),transparent_18%),radial-gradient(circle_at_38%_48%,rgba(255,255,255,0.14),transparent_12%),linear-gradient(145deg,#030303_0%,#151515_42%,#7a7a7a_51%,#1c1c1c_66%,#050505_100%)]"
              style={mediaClipStyle}
            >
              <video
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                onCanPlay={() => setIsVideoReady(true)}
                onLoadedData={() => setIsVideoReady(true)}
                className={panelVideoClassName}
              >
                <source src={AUTH_VIDEO_URL} type="video/mp4" />
              </video>
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.22)),radial-gradient(circle_at_50%_36%,rgba(255,255,255,0.12),transparent_34%)]" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" />
            </div>

            <div className="relative z-10 flex h-full flex-col justify-between p-7 pb-20 pr-24">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold tracking-tight">{eyebrow}</p>
                <div className="flex items-center gap-4 text-xs">
                  <Link href={switchHref} className="text-white/85 hover:text-white">
                    {switchLabel}
                  </Link>
                  <Link
                    href={switchHref}
                    className="rounded-full border border-white/70 px-4 py-2 text-white transition-colors hover:bg-white hover:text-black"
                  >
                    {switchText}
                  </Link>
                </div>
              </div>

              <div className="max-w-sm pb-5">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur-md">
                  <Sparkles className="h-3.5 w-3.5" />
                  WarpTalk cinematic access
                </div>
                <h2 className="text-4xl font-semibold leading-[0.95] tracking-tight">
                  Step into real-time translation.
                </h2>
                <p className="mt-4 text-sm leading-6 text-white/70">
                  A premium authentication experience with motion, depth, and a
                  calm glass interface for global teams.
                </p>
              </div>
            </div>
          </aside>

          <div className="relative flex min-h-[36rem] flex-col rounded-[0.95rem] bg-white px-6 py-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] sm:px-10 lg:rounded-l-none lg:px-14">
            <div className="flex items-center justify-between gap-4">
              <Link
                href="/"
                className="text-sm font-bold uppercase tracking-wide text-black/70"
              >
                WarpTalk
              </Link>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-black/20 px-3 py-1 text-[0.72rem] font-medium text-black/70"
                aria-label="Language selector"
              >
                <Globe2 className="h-3.5 w-3.5" />
                EN
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            <div className="mx-auto flex w-full max-w-[21rem] flex-1 flex-col justify-center py-8">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
