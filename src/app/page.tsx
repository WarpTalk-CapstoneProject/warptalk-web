"use client";

import { memo, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import Hls from "hls.js";
import { motion } from "motion/react";

const VIDEO_SRC =
  "https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8";

const navLinks = [
  { label: "About", href: "#about" },
  { label: "Feature", href: "#features", active: true },
  { label: "Pricing", href: "#pricing" },
  { label: "Contact", href: "#contact" },
];

const badges = ["Live Runtime", "AI Insights", "Cloud Deploy"];
const logos = ["NOVA", "AXIS", "ORBIT", "PRISM", "LUMA", "ECHO"];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
};

const VideoPlayer = memo(function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(VIDEO_SRC);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = VIDEO_SRC;
    }

    video.play().catch(() => {
      // Autoplay can be blocked in some browser states; muted playback usually succeeds.
    });

    return () => {
      if (hls) {
        hls.destroy();
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[35vh] h-[80vh] overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        className="size-full object-cover opacity-100"
      />
    </div>
  );
});

function BadgeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
      <path
        d="M8 1.75 9.8 6.2l4.45 1.8L9.8 9.8 8 14.25 6.2 9.8 1.75 8 6.2 6.2 8 1.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlaceholderLogo({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 opacity-40 grayscale">
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-7">
        <rect x="4" y="4" width="24" height="24" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 17h12M16 10v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="text-sm font-medium tracking-[0.24em]">{label}</span>
    </div>
  );
}

function WarpTalkNavLogo() {
  return (
    <span className="relative block h-10 w-36 overflow-hidden" aria-label="WarpTalk">
      <Image
        src="/assets/logos/warptalk-logo-darkmode.jpg"
        alt="WarpTalk"
        width={144}
        height={144}
        priority
        className="absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 object-cover"
      />
    </span>
  );
}

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#000000] font-[Helvetica_Neue,Helvetica,Arial,sans-serif] font-normal text-white antialiased">
      <VideoPlayer />

      <header className="fixed left-0 right-0 top-0 z-30 px-5 py-5 md:px-8 lg:px-12">
        <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-4 py-3 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <Link href="/" className="flex items-center" aria-label="WarpTalk home">
            <WarpTalkNavLogo />
          </Link>

          <div className="hidden items-center gap-2 text-sm text-white/62 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className={
                  link.active
                    ? "rounded-full bg-gradient-to-r from-white/35 via-white/10 to-white/35 p-px text-white"
                    : "px-4 py-2 transition-colors hover:text-white"
                }
              >
                <span className={link.active ? "block rounded-full bg-black/75 px-4 py-2" : undefined}>
                  {link.label}
                </span>
              </a>
            ))}
          </div>

          <Link
            href="/register"
            className="rounded-xl bg-gradient-to-b from-white to-neutral-300 px-5 py-2.5 text-sm font-medium text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:from-white hover:to-white"
          >
            Get Started for Free
          </Link>
        </nav>
      </header>

      <section className="relative z-10 flex min-h-screen items-center justify-center px-5 pb-36 pt-32 text-center md:px-8 lg:px-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto flex w-full max-w-6xl flex-col items-center"
        >
          <motion.div variants={itemVariants} className="mb-7 flex flex-wrap justify-center gap-3">
            {badges.map((badge) => (
              <div
                key={badge}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md"
              >
                <BadgeIcon />
                <span>Integrated with</span>
                <span className="text-white">{badge}</span>
              </div>
            ))}
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="max-w-5xl text-[3.25rem] font-normal leading-[0.92] tracking-[-0.065em] text-white md:text-[5rem] lg:text-[6.1rem]"
          >
            Translation that feel native
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="mt-6 max-w-2xl text-base leading-7 text-white/58 md:text-lg"
          >
            Real-time interpretation global teams. Natural conversations. Zero language barriers
          </motion.p>

          <motion.div variants={itemVariants} className="mt-9 flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="rounded-xl border border-white/55 bg-black px-7 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition-colors hover:bg-white hover:text-black"
            >
              Get Started for Free
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-white/10 bg-white/[0.06] px-7 py-3 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white hover:text-black"
            >
              Let&apos;s Get Connected
            </Link>
          </motion.div>
        </motion.div>
      </section>

      <div className="absolute bottom-8 left-0 right-0 z-20 px-5 md:px-8 lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-5 text-white">
          {logos.map((logo) => (
            <PlaceholderLogo key={logo} label={logo} />
          ))}
        </div>
      </div>
    </main>
  );
}
