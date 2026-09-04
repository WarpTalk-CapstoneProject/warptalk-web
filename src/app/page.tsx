"use client";

import { memo, useEffect, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import Hls from "hls.js";
import { AnimatePresence, motion, useScroll, useTransform } from "motion/react";
import type { MotionValue, Variants } from "motion/react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import { getPlanDescription, buildFeatureList, cn } from "@/lib/utils";
import { createHubConnection } from "@/lib/realtime/signalr";
import {
  getLandingGetStartedHref,
  getRememberedWorkspaceSlug,
  hasRememberedAccessToken,
} from "@/lib/auth/landing-redirect";
import type { PlanDto } from "@/types/billing";
import { formatMoney } from "@/lib/format/currency";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
const VIDEO_SRC =
  "https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8";

const navLinks = [
  { id: "about", href: "#about" },
  { id: "features", href: "#features" },
  { id: "pricing", href: "#pricing" },
  { id: "contact", href: "#contact" },
];

const badgeKeys = [
  "realtimeTranslation",
  "aiSummaryAnalysis",
  "humanVoiceCloning",
] as const;
const logos = ["NOVA", "AXIS", "ORBIT", "PRISM", "LUMA", "ECHO"];
// i18n-allow: single words on the splash screen, not read for their meaning.
const loaderWords = ["Translation", "Clone Voice", "AI"];

const featureSteps = [
  { number: "01", key: "signalDrift" },
  { number: "02", key: "languageCrossing" },
  { number: "03", key: "thePause" },
  { number: "04", key: "memoryBloom" },
] as const;

const signalRows = [
  { number: "01", key: "capture", pattern: "wave" },
  { number: "02", key: "understand", pattern: "ring" },
  { number: "03", key: "translate", pattern: "sine" },
  { number: "04", key: "speak", pattern: "orb" },
  { number: "05", key: "remember", pattern: "arc" },
] as const;

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.15,
    },
  },
} satisfies Variants;

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const },
  },
} satisfies Variants;

function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setWordIndex((current) => {
        if (current >= loaderWords.length - 1) {
          window.clearInterval(interval);
          return current;
        }

        return current + 1;
      });
    }, 900);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let frame = 0;
    let completeTimer = 0;
    const start = performance.now();

    const updateProgress = (now: number) => {
      const elapsed = now - start;
      const nextProgress = Math.min((elapsed / 2700) * 100, 100);
      setProgress(nextProgress);

      if (nextProgress < 100) {
        frame = requestAnimationFrame(updateProgress);
      } else {
        completeTimer = window.setTimeout(() => {
          onCompleteRef.current();
        }, 400);
      }
    };

    frame = requestAnimationFrame(updateProgress);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(completeTimer);
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-[#0a0a0a] text-[#f5f5f5]"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
    >
      <motion.div
        className="absolute left-8 top-8 text-xs uppercase tracking-[0.3em] text-[#888888] md:left-12 md:top-12 md:text-sm"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        WalpTalk
      </motion.div>

      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={wordIndex}
            className="font-display text-4xl italic text-[#f5f5f5]/80 md:text-6xl lg:text-7xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            {loaderWords[wordIndex]}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.div
        className="font-display absolute bottom-8 right-8 text-6xl tabular-nums text-[#f5f5f5] md:bottom-12 md:right-12 md:text-8xl lg:text-9xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        {Math.round(progress).toString().padStart(3, "0")}
      </motion.div>

      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#1f1f1f]/50">
        <motion.div
          className="h-full origin-left"
          style={{
            scaleX: progress / 100,
            background: "linear-gradient(90deg, #89AACC 0%, #4E85BF 100%)",
            boxShadow: "0 0 8px rgba(137, 170, 204, 0.35)",
          }}
          transition={{ duration: 0.1, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}

const VideoPlayer = memo(function VideoPlayer({
  onReady,
}: {
  onReady: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let fallbackTimer = 0;
    let hasReportedReady = false;

    const reportReady = () => {
      if (hasReportedReady) return;
      hasReportedReady = true;
      onReadyRef.current();
    };

    video.addEventListener("loadeddata", reportReady);
    video.addEventListener("canplay", reportReady);
    fallbackTimer = window.setTimeout(reportReady, 9000);

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.on(Hls.Events.MANIFEST_PARSED, reportReady);
      hls.loadSource(VIDEO_SRC);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = VIDEO_SRC;
    }

    video.play().catch(() => {
      // Autoplay can be blocked in some browser states; muted playback usually succeeds.
    });

    return () => {
      window.clearTimeout(fallbackTimer);
      video.removeEventListener("loadeddata", reportReady);
      video.removeEventListener("canplay", reportReady);
      if (hls) {
        hls.destroy();
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
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
        <rect
          x="4"
          y="4"
          width="24"
          height="24"
          rx="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M10 17h12M16 10v12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-sm font-medium tracking-[0.24em]">{label}</span>
    </div>
  );
}

function WarpTalkNavLogo() {
  return (
    <span
      className="relative block h-9 w-32 overflow-hidden bg-black"
      aria-label="WarpTalk"
    >
      <Image
        src="/assets/logos/warptalk-logo-darkmode.jpg"
        alt="WarpTalk"
        width={144}
        height={144}
        priority
        className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 object-cover"
      />
    </span>
  );
}

function FeaturePattern({ type }: { type: string }) {
  if (type === "ring") {
    return (
      <svg viewBox="0 0 120 44" aria-hidden="true">
        <ellipse cx="60" cy="22" rx="34" ry="10" />
        <ellipse cx="60" cy="22" rx="22" ry="6" />
        <path d="M24 22c18-18 54-18 72 0M24 22c18 18 54 18 72 0" />
      </svg>
    );
  }

  if (type === "sine") {
    return (
      <svg viewBox="0 0 120 44" aria-hidden="true">
        <path d="M8 22c8-18 16-18 24 0s16 18 24 0 16-18 24 0 16 18 32 0" />
        <path d="M8 30c8-8 16-8 24 0s16 8 24 0 16-8 24 0 16 8 32 0" />
      </svg>
    );
  }

  if (type === "orb") {
    return (
      <svg viewBox="0 0 120 44" aria-hidden="true">
        <circle cx="60" cy="22" r="16" />
        <circle cx="60" cy="22" r="26" />
        <path d="M36 22c12-12 36-12 48 0M36 22c12 12 36 12 48 0" />
      </svg>
    );
  }

  if (type === "arc") {
    return (
      <svg viewBox="0 0 120 44" aria-hidden="true">
        <path d="M20 36c6-28 74-28 80 0" />
        <path d="M30 36c5-18 55-18 60 0" />
        <path d="M40 36c4-9 36-9 40 0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 44" aria-hidden="true">
      <path d="M8 22h10m6 0h4m6 0h18m6 0h4m6 0h8m8 0h28" />
      <path d="M74 12v20M80 16v12M86 8v28M92 14v16M98 18v8" />
    </svg>
  );
}

function BranchLabel({
  x,
  y,
  tickTop,
  tickBottom,
  label,
  progress,
  revealAt,
  align = "middle",
}: {
  x: number;
  y: number;
  tickTop: number;
  tickBottom: number;
  label: string;
  progress: MotionValue<number>;
  revealAt: number;
  align?: "middle" | "start";
}) {
  const labelOpacity = useTransform(
    progress,
    [Math.max(0, revealAt - 0.12), revealAt],
    [0, 1],
  );
  const tickLength = useTransform(
    progress,
    [Math.max(0, revealAt - 0.2), revealAt],
    [0, 1],
  );
  const nodeScale = useTransform(
    progress,
    [Math.max(0, revealAt - 0.08), revealAt],
    [0, 1],
  );

  return (
    <motion.g
      className="feature-branch-label"
      style={{ opacity: labelOpacity }}
    >
      <motion.line
        x1={x}
        y1={tickTop}
        x2={x}
        y2={tickBottom}
        style={{ pathLength: tickLength }}
      />
      <motion.circle
        cx={x}
        cy={tickBottom}
        r="2.4"
        style={{ scale: nodeScale }}
      />
      <text
        className={align === "start" ? "feature-branch-label-start" : undefined}
        x={x}
        y={y}
      >
        {label}
      </text>
    </motion.g>
  );
}

function BranchTextLabel({
  x,
  y,
  label,
  progress,
  revealAt,
}: {
  x: number;
  y: number;
  label: string;
  progress: MotionValue<number>;
  revealAt: number;
}) {
  const labelOpacity = useTransform(
    progress,
    [Math.max(0, revealAt - 0.1), revealAt],
    [0, 1],
  );

  return (
    <motion.text
      className="feature-branch-label-start"
      x={x}
      y={y}
      style={{ opacity: labelOpacity }}
    >
      {label}
    </motion.text>
  );
}

function FeatureStoryBoard() {
  const t = useTranslations("landing");
  const storyRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ["start 92%", "end 72%"],
  });
  const spineProgress = useTransform(scrollYProgress, [0, 0.94], [0, 1]);
  const driftProgress = useTransform(spineProgress, [0.118, 0.218], [0, 1]);
  const crossingProgress = useTransform(spineProgress, [0.252, 0.38], [0, 1]);
  const pauseProgress = useTransform(spineProgress, [0.387, 0.524], [0, 1]);
  const memoryProgress = useTransform(spineProgress, [0.639, 0.768], [0, 1]);
  const driftOpacity = useTransform(driftProgress, [0.04, 0.14], [0, 1]);
  const crossingOpacity = useTransform(crossingProgress, [0.04, 0.14], [0, 1]);
  const pauseOpacity = useTransform(pauseProgress, [0.04, 0.14], [0, 1]);
  const memoryOpacity = useTransform(memoryProgress, [0.04, 0.14], [0, 1]);
  const driftTrunkProgress = useTransform(driftProgress, [0, 0.42], [0, 1]);
  const driftForkProgress = useTransform(driftProgress, [0.42, 1], [0, 1]);
  const driftForkOpacity = useTransform(
    driftForkProgress,
    [0.04, 0.12],
    [0, 1],
  );
  const crossingTrunkProgress = useTransform(
    crossingProgress,
    [0, 0.38],
    [0, 1],
  );
  const crossingForkProgress = useTransform(
    crossingProgress,
    [0.38, 1],
    [0, 1],
  );
  const crossingForkOpacity = useTransform(
    crossingForkProgress,
    [0.04, 0.12],
    [0, 1],
  );
  const pauseTrunkProgress = useTransform(pauseProgress, [0, 0.58], [0, 1]);
  const pauseForkProgress = useTransform(pauseProgress, [0.58, 1], [0, 1]);
  const pauseForkOpacity = useTransform(
    pauseForkProgress,
    [0.04, 0.12],
    [0, 1],
  );
  const memoryTrunkProgress = useTransform(memoryProgress, [0, 0.46], [0, 1]);
  const memoryForkProgress = useTransform(memoryProgress, [0.46, 1], [0, 1]);
  const memoryForkOpacity = useTransform(
    memoryForkProgress,
    [0.04, 0.12],
    [0, 1],
  );
  const signalProgress = useTransform(spineProgress, [0.8, 1.015], [0, 1]);
  const signalCopyOpacity = useTransform(signalProgress, [0, 0.08], [0, 1]);
  const signalCopyY = useTransform(signalCopyOpacity, [0, 1], [18, 0]);
  const signalDotProgress = [
    useTransform(signalProgress, [0.08, 0.12], [0, 1]),
    useTransform(signalProgress, [0.13, 0.17], [0, 1]),
    useTransform(signalProgress, [0.18, 0.22], [0, 1]),
    useTransform(signalProgress, [0.23, 0.27], [0, 1]),
    useTransform(signalProgress, [0.28, 0.32], [0, 1]),
  ];
  const signalLineProgress = [
    useTransform(signalProgress, [0.2, 0.34], [0, 1]),
    useTransform(signalProgress, [0.36, 0.5], [0, 1]),
    useTransform(signalProgress, [0.52, 0.66], [0, 1]),
    useTransform(signalProgress, [0.68, 0.82], [0, 1]),
    useTransform(signalProgress, [0.84, 0.96], [0, 1]),
  ];
  const signalRowOpacity = [
    useTransform(signalProgress, [0.2, 0.26], [0, 1]),
    useTransform(signalProgress, [0.36, 0.42], [0, 1]),
    useTransform(signalProgress, [0.52, 0.58], [0, 1]),
    useTransform(signalProgress, [0.68, 0.74], [0, 1]),
    useTransform(signalProgress, [0.84, 0.9], [0, 1]),
  ];
  const signalRowY = [
    useTransform(signalRowOpacity[0], [0, 1], [18, 0]),
    useTransform(signalRowOpacity[1], [0, 1], [18, 0]),
    useTransform(signalRowOpacity[2], [0, 1], [18, 0]),
    useTransform(signalRowOpacity[3], [0, 1], [18, 0]),
    useTransform(signalRowOpacity[4], [0, 1], [18, 0]),
  ];
  const stepOpacity = [
    useTransform(driftProgress, [0.06, 0.2], [0, 1]),
    useTransform(crossingProgress, [0.06, 0.2], [0, 1]),
    useTransform(pauseProgress, [0.06, 0.2], [0, 1]),
    useTransform(memoryProgress, [0.06, 0.2], [0, 1]),
  ];
  const stepY = [
    useTransform(stepOpacity[0], [0, 1], [24, 0]),
    useTransform(stepOpacity[1], [0, 1], [24, 0]),
    useTransform(stepOpacity[2], [0, 1], [24, 0]),
    useTransform(stepOpacity[3], [0, 1], [24, 0]),
  ];

  return (
    <div ref={storyRef} className="feature-story-board">
      <motion.svg
        className="feature-story-map"
        viewBox="0 0 1120 2740"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="feature-story-spine-base"
          d="M80 0 C 10 122 34 242 130 300 C 252 374 236 540 108 620 C 0 704 36 882 144 960 C 258 1064 248 1522 112 1650 C 54 1708 72 1774 164 1822 C 198 1848 218 1928 226 2006 C 232 2084 226 2158 226 2248 V2650"
        />
        <motion.path
          className="feature-story-spine-live"
          d="M80 0 C 10 122 34 242 130 300 C 252 374 236 540 108 620 C 0 704 36 882 144 960 C 258 1064 248 1522 112 1650 C 54 1708 72 1774 164 1822 C 198 1848 218 1928 226 2006 C 232 2084 226 2158 226 2248 V2650"
          style={{ pathLength: spineProgress }}
        />

        <g>
          <motion.path
            className="feature-story-branch"
            d="M130 300 C 180 336 240 390 360 390 H470"
            style={{ pathLength: driftTrunkProgress, opacity: driftOpacity }}
          />
          {[
            "M470 390 C 554 390 574 318 692 318 S 862 390 1094 358",
            "M470 390 C 556 390 590 444 682 404 S 868 358 1094 404",
          ].map((path, index) => (
            <motion.path
              className={
                index === 1
                  ? "feature-story-branch feature-story-child-branch feature-story-dots"
                  : "feature-story-branch feature-story-child-branch"
              }
              d={path}
              key={path}
              style={{
                pathLength: driftForkProgress,
                opacity: driftForkOpacity,
              }}
            />
          ))}
          {/*
            Phase A scope note (see .agents/page-docs/i18n-localization.md): the annotation
            labels along this hand-tuned SVG story map ("live", "low latency", language names,
            "decisions"/"questions"/etc. below) are left English-only for now. Their x/y
            coordinates were tuned against these exact character widths, and swapping in
            longer vi/ja strings would need each position re-tuned per locale — real work,
            tracked as Phase B rather than done blind here.
          */}
          <BranchLabel
            x={586}
            y={484}
            tickTop={372}
            tickBottom={454}
            label="live"
            progress={driftForkProgress}
            revealAt={0.28}
          />
          <BranchLabel
            x={820}
            y={484}
            tickTop={368}
            tickBottom={454}
            label="low latency"
            progress={driftForkProgress}
            revealAt={0.58}
          />
          <BranchLabel
            x={1016}
            y={484}
            tickTop={372}
            tickBottom={454}
            label="room signal"
            progress={driftForkProgress}
            revealAt={0.86}
          />
        </g>

        <g>
          <motion.path
            className="feature-story-branch"
            d="M108 620 C 176 664 246 720 370 720 H488"
            style={{
              pathLength: crossingTrunkProgress,
              opacity: crossingOpacity,
            }}
          />
          {[
            "M488 720 C 572 720 620 638 730 638 S 914 692 1094 664",
            "M488 720 C 574 720 620 796 742 758 S 888 706 1094 776",
            "M488 720 C 590 720 658 830 780 800 S 950 734 1094 722",
          ].map((path, index) => (
            <motion.path
              className={
                index === 1
                  ? "feature-story-branch feature-story-child-branch feature-story-dots"
                  : "feature-story-branch feature-story-child-branch"
              }
              d={path}
              key={path}
              style={{
                pathLength: crossingForkProgress,
                opacity: crossingForkOpacity,
              }}
            />
          ))}
          <BranchLabel
            x={594}
            y={652}
            tickTop={646}
            tickBottom={696}
            label="Vietnamese"
            progress={crossingForkProgress}
            revealAt={0.24}
          />
          <BranchLabel
            x={756}
            y={686}
            tickTop={668}
            tickBottom={730}
            label="English"
            progress={crossingForkProgress}
            revealAt={0.46}
          />
          <BranchLabel
            x={908}
            y={628}
            tickTop={626}
            tickBottom={682}
            label="French"
            progress={crossingForkProgress}
            revealAt={0.66}
          />
          <BranchLabel
            x={1012}
            y={808}
            tickTop={742}
            tickBottom={800}
            label="Japanese"
            progress={crossingForkProgress}
            revealAt={0.84}
          />
        </g>

        <g>
          <motion.path
            className="feature-story-branch feature-story-dots"
            d="M144 960 C 216 1024 276 1140 430 1140 H560"
            style={{ pathLength: pauseTrunkProgress, opacity: pauseOpacity }}
          />
          <motion.path
            className="feature-story-branch feature-story-child-branch"
            d="M560 1140 C 574 1140 584 1140 596 1140 H1094"
            style={{ pathLength: pauseForkProgress, opacity: pauseForkOpacity }}
          />
        </g>

        <g>
          <motion.path
            className="feature-story-branch"
            d="M112 1650 C 184 1714 250 1806 420 1806 H520"
            style={{ pathLength: memoryTrunkProgress, opacity: memoryOpacity }}
          />
          {[
            "M520 1806 C 620 1806 652 1662 810 1662 H1094",
            "M520 1806 C 632 1806 666 1708 810 1708 H1094",
            "M520 1806 C 646 1806 682 1754 810 1754 H1094",
            "M520 1806 C 666 1806 702 1800 810 1800 H1094",
          ].map((path) => (
            <motion.path
              className="feature-story-branch feature-story-child-branch"
              d={path}
              key={path}
              style={{
                pathLength: memoryForkProgress,
                opacity: memoryForkOpacity,
              }}
            />
          ))}
          <BranchTextLabel
            x={982}
            y={1662}
            label="decisions"
            progress={memoryForkProgress}
            revealAt={0.54}
          />
          <BranchTextLabel
            x={982}
            y={1708}
            label="questions"
            progress={memoryForkProgress}
            revealAt={0.62}
          />
          <BranchTextLabel
            x={982}
            y={1754}
            label="next steps"
            progress={memoryForkProgress}
            revealAt={0.7}
          />
          <BranchTextLabel
            x={982}
            y={1800}
            label="names"
            progress={memoryForkProgress}
            revealAt={0.78}
          />
        </g>

        {[2254, 2346, 2438, 2530, 2622].map((point, index) => (
          <g key={point}>
            <motion.path
              className="feature-story-signal-row-line"
              d={`M214 ${point} H1094`}
              style={{
                pathLength: signalLineProgress[index],
                opacity: signalLineProgress[index],
              }}
            />
            <motion.circle
              className="feature-story-signal-dot"
              cx="226"
              cy={point}
              r="4.5"
              style={{
                opacity: signalDotProgress[index],
                scale: signalDotProgress[index],
              }}
            />
          </g>
        ))}
      </motion.svg>

      {featureSteps.map((step, index) => (
        <motion.article
          className={`feature-story-step feature-story-step-${step.number}`}
          key={step.number}
          style={{ opacity: stepOpacity[index], y: stepY[index] }}
        >
          <div className="feature-story-index">
            <span>{step.number}</span>
            <small>{t(`featureSteps.${step.key}.kicker`)}</small>
          </div>
          <h2>{t(`featureSteps.${step.key}.title`)}</h2>
        </motion.article>
      ))}

      <span className="feature-story-watermark" aria-hidden="true">
        PAUSE
      </span>

      <div className="feature-signal-stage">
        <motion.aside
          className="feature-signal-copy"
          style={{ opacity: signalCopyOpacity, y: signalCopyY }}
        >
          <h3>{t("systemSignalsTitle")}</h3>
          <p>{t("systemSignalsBody")}</p>
        </motion.aside>

        <motion.div
          className="feature-signal-list"
          style={{ opacity: signalCopyOpacity }}
        >
          {signalRows.map((row, index) => (
            <motion.div
              className="feature-signal-row"
              key={row.number}
              style={{
                opacity: signalRowOpacity[index],
                y: signalRowY[index],
              }}
            >
              <span className="feature-signal-number">{row.number}</span>
              <span className="feature-signal-label">
                <small>{t(`signals.${row.key}.meta`)}</small>
                <strong>{t(`signals.${row.key}.label`)}</strong>
              </span>
              <span className="feature-signal-pattern">
                <FeaturePattern type={row.pattern} />
              </span>
              <span className="feature-signal-plus">+</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function FeatureTraceSection() {
  const t = useTranslations("landing");
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 76%", "end 18%"],
  });
  const pathLength = scrollYProgress;

  return (
    <section
      ref={sectionRef}
      id="features"
      className="feature-trace-section scroll-mt-20"
    >
      <div className="feature-trace-inner">
        <FeatureStoryBoard />

        <div className="feature-human-row">
          <motion.div
            className="feature-human-title"
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2>{t("voiceHeading")}</h2>
          </motion.div>
          <div className="feature-wave-panel">
            {/* i18n-allow: single-word ambient labels in a decorative waveform panel, not
                load-bearing content — kept in this Phase A pass, see i18n-localization.md. */}
            <div className="feature-wave-labels">
              <span>tone</span>
              <span>intent</span>
              <span>pace</span>
              <span>native flow</span>
            </div>
            <svg viewBox="0 0 900 220" aria-hidden="true">
              <path
                className="feature-wave-base"
                d="M0 130 C 90 78 150 78 238 132 S 384 182 470 110 650 58 752 126 850 172 900 122"
              />
              <motion.path
                className="feature-wave-live"
                d="M0 130 C 90 78 150 78 238 132 S 384 182 470 110 650 58 752 126 850 172 900 122"
                style={{ pathLength }}
              />
              <path
                className="feature-wave-dots"
                d="M410 126 C 500 86 600 88 690 132 S 825 176 900 126"
              />
            </svg>
          </div>
        </div>

        <div className="feature-understand-row">
          <div>
            <h2>{t("understandHeading")}</h2>
            <p>{t("understandBody")}</p>
          </div>
          {/* i18n-allow: decorative language-name chips illustrating the product's multilingual
              reach, not read as instructional copy — kept in this Phase A pass. */}
          <div className="feature-language-line">
            <span>English</span>
            <span>Vietnamese</span>
            <span>French</span>
            <span>meaning preserved</span>
            <span>voice returned</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const t = useTranslations("landing");
  const pricingT = (key: string, values?: Record<string, string | number>) =>
    t(`pricing.${key}` as string, values);
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["landing-plans"],
    queryFn: () => billingService.getPlans(),
  });

  // WT-491: the plan the visitor clicked travels with them. It used to be dropped here — this
  // pushed the plain get-started href — so a guest who chose a paid plan signed up, landed in an
  // empty workspace, and had nothing on screen to say they had asked to buy anything.
  const handleChoosePlan = (planSlug?: string) => {
    router.push(
      getLandingGetStartedHref({
        isAuthenticated,
        user,
        hasRememberedSession: hasRememberedAccessToken(),
        activeWorkspaceSlug: getRememberedWorkspaceSlug(activeWorkspaceSlug),
        planSlug,
      }),
    );
  };

  return (
    <section
      id="pricing"
      className="c3-pricing-section scroll-mt-20 bg-[#0c0c0c] text-white"
    >
      <svg aria-hidden="true" className="pointer-events-none absolute size-0">
        <filter id="c3-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.5"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.075" />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
        </filter>
      </svg>

      <div className="c3-watermark-container">
        <div className="c3-watermark-main">
          <span className="c3-watermark-line-1">Translation</span>
          <span className="c3-watermark-line-2">Native</span>
        </div>
      </div>

      <div className="c3-grid">
        {isLoading ? (
          <div className="col-span-full flex justify-center py-20 text-white/50">
            {t("pricing.loading")}
          </div>
        ) : (
          plans
            .filter((plan: PlanDto) => plan.isActive !== false)
            .sort((a: PlanDto, b: PlanDto) => a.sortOrder - b.sortOrder)
            .map((plan: PlanDto) => {
              const featureList = buildFeatureList(plan, pricingT);

              return (
                <article
                  className={
                    plan.sortOrder > 1 ? "c3-card c3-card-pro" : "c3-card"
                  }
                  key={plan.id}
                >
                  <p className="c3-tier-small">{plan.tier}</p>
                  <h3 className="c3-tier-large">
                    {plan.price === 0
                      ? t("pricing.free")
                      : `${formatMoney(plan.price, plan.currency)}${t("pricing.perMonth")}`}
                  </h3>
                  <p className="c3-desc">{getPlanDescription(plan.name, pricingT)}</p>
                  <ul className="c3-list">
                    {featureList.map((feature: string) => (
                      <li key={feature}>
                        <span className="c3-check" aria-hidden="true">
                          <svg viewBox="0 0 16 16" className="size-3.5">
                            <path
                              d="M13.5 4.25 6.25 11.5 2.5 7.75"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="c3-btn cursor-pointer"
                    onClick={() => handleChoosePlan(plan.slug)}
                  >
                    {t("pricing.choosePlan")}
                  </button>
                </article>
              );
            })
        )}
      </div>
    </section>
  );
}

/**
 * WT-584: entries carry an href now, because one of them finally has somewhere to go.
 *
 * The rest still point at "#" — they were written before the sections they name existed and
 * that is a separate piece of work. Encoding the destination per entry rather than hardcoding
 * "#" at the call site is what lets the download link be real without pretending the others are.
 */
const footerNavigation: Array<{ key: string; href: string }> = [
  { key: "navHowItWorks", href: "#" },
  { key: "navFeatures", href: "#features" },
  { key: "navPricing", href: "#pricing" },
  { key: "navDownload", href: "/download" },
  { key: "navTestimonials", href: "#" },
  { key: "navFaq", href: "#" },
];
const footerCompanyKeys = [
  "companyBlog",
  "companyAbout",
  "companyTerms",
  "companyPrivacy",
] as const;

const footerSocialIcons = [
  {
    label: "Discord",
    path: "M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515c.074-.037-.111.037-.148.111-.592 1.072-1.257 2.479-1.257 2.479a18.27 18.27 0 0 0-5.487 0s-.666-1.407-1.258-2.48c-.037-.073-.074-.11-.148-.11A19.736 19.736 0 0 0 3.23 4.37a.136.136 0 0 0-.074.074C.533 8.438-.204 12.318.099 16.15c0 .037.037.074.074.111a19.9 19.9 0 0 0 5.993 3.034c.074.037.148 0 .185-.074.462-.629.873-1.295 1.22-1.998.037-.074 0-.148-.074-.185a13.107 13.107 0 0 1-1.887-.888c-.074-.037-.074-.148-.037-.185.126-.092.252-.185.37-.281.037-.037.111-.037.148-.019a14.26 14.26 0 0 0 12.372 0c.037-.018.111-.018.148.019.118.096.244.189.37.281.037.037.037.148-.037.185-.592.35-1.22.647-1.887.888-.074.037-.111.111-.074.185.37.703.777 1.369 1.22 1.998.037.074.111.111.185.074a19.839 19.839 0 0 0 6.002-3.034c.037-.037.074-.074.074-.111.364-4.473-.613-8.316-3.548-11.706a.123.123 0 0 0-.074-.074ZM8.02 13.747c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.096 2.157 2.418 0 1.334-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.096 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z",
  },
  {
    label: "X",
    path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  },
  {
    label: "LinkedIn",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0Z",
  },
  {
    label: "GitHub",
    path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.084-.729.084-.729 1.205.084 1.84 1.236 1.84 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.435.375.81 1.102.81 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  },
];

function FooterLogoMark({ large = false }: { large?: boolean }) {
  return (
    <span
      className={
        large ? "footer-logo-mark footer-logo-mark-large" : "footer-logo-mark"
      }
    >
      <Image
        src="/assets/logos/warptalk-icon-1k.jpg"
        alt=""
        width={large ? 64 : 32}
        height={large ? 64 : 32}
        className="footer-logo-mark-image"
      />
    </span>
  );
}

function LandingFooter() {
  const t = useTranslations("landing.footer");
  useEffect(() => {
    function fitWatermark() {
      const svg = document.getElementById("watermarkSvg");
      const text = document.getElementById(
        "watermarkText",
      ) as SVGTextElement | null;
      if (!svg || !text) return;

      try {
        const bbox = text.getBBox();
        svg.setAttribute(
          "viewBox",
          `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`,
        );
      } catch {}
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(fitWatermark);
    } else {
      window.addEventListener("load", fitWatermark);
    }

    window.addEventListener("resize", fitWatermark);

    return () => {
      window.removeEventListener("load", fitWatermark);
      window.removeEventListener("resize", fitWatermark);
    };
  }, []);

  return (
    <section id="contact" className="footer-section">
      <div className="footer-wrapper">
        <div className="footer-left">
          <video
            className="footer-left-video"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          >
            <source
              src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260503_104800_bc43ae09-f494-43e3-97d7-2f8c1692cfd7.mp4"
              type="video/mp4"
            />
          </video>

          <div className="footer-logo">
            <FooterLogoMark />
            <span className="footer-logo-name">WarpTalk</span>
          </div>

          <div className="footer-tagline-container">
            <p className="footer-tagline">
              {t("taglineLine1")}
              <br />
              <span>{t("taglineLine2")}</span>
            </p>
          </div>

          <div className="footer-social-row">
            <span className="footer-social-label">{t("stayInTouch")}</span>
            <div className="footer-social-icons" aria-label="Social links">
              {footerSocialIcons.map((icon) => (
                <div
                  className="social-icon"
                  key={icon.label}
                  aria-label={icon.label}
                  role="img"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={icon.path} />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="footer-right">
          <div className="footer-lucky-graphic">
            <div className="lucky-cube">
              <span className="lucky-cube-mark">
                <FooterLogoMark large />
              </span>
            </div>
            <div className="lucky-text-row">
              <svg
                className="lucky-arrow"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M3 20 C 6 14, 10 9, 18 5" />
                <path d="M18 5 L 12 5" />
                <path d="M18 5 L 18 11" />
              </svg>
              <span className="lucky-text">{t("feelingLucky")}</span>
            </div>
          </div>

          <div className="footer-right-top">
            <div className="footer-nav-cols">
              <div className="footer-col">
                <h3 className="footer-col-title">{t("navigationTitle")}</h3>
                {footerNavigation.map((item) => (
                  <a href={item.href} key={item.key}>
                    {t(item.key as string)}
                  </a>
                ))}
              </div>
              <div className="footer-col">
                <h3 className="footer-col-title">{t("companyTitle")}</h3>
                {footerCompanyKeys.map((key) => (
                  <a href="#" key={key}>
                    {t(key)}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copyright">{t("copyright")}</p>
            <div className="footer-cta-mini">
              <h4>
                {t("ctaLine1")}
                <br />
                <strong>{t("ctaLine2")}</strong>
              </h4>
              <div className="footer-subscribe-row">
                <input type="email" placeholder={t("emailPlaceholder")} />
                <button type="button">{t("subscribe")}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-watermark" aria-hidden="true">
        <svg
          id="watermarkSvg"
          viewBox="62 95 876 175"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          <text
            id="watermarkText"
            x="500"
            y="240"
            textAnchor="middle"
            fontSize="320"
          >
            WarpTalk
          </text>
        </svg>
      </div>
    </section>
  );
}

export default function HomePage() {
  const t = useTranslations("landing");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [hasLoaderFinished, setHasLoaderFinished] = useState(false);
  const [hasShellLoaded, setHasShellLoaded] = useState(false);
  const [hasHeroVideoLoaded, setHasHeroVideoLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const isLoading =
    !hasLoaderFinished || !hasShellLoaded || !hasHeroVideoLoaded;

  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const accessToken = useAuthStore((state) => state.accessToken);

  const handleGetStarted = () => {
    router.push(
      getLandingGetStartedHref({
        isAuthenticated,
        user,
        hasRememberedSession: hasRememberedAccessToken(),
        activeWorkspaceSlug: getRememberedWorkspaceSlug(activeWorkspaceSlug),
      }),
    );
  };

  // SignalR connection for real-time landing page pricing updates
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const connection = createHubConnection("/hubs/notification");

    connection.on("NewNotification", (notification) => {
      if (notification?.type === "billing.plan_changed") {
        queryClient.invalidateQueries({ queryKey: ["landing-plans"] });
      }
    });

    let isMounted = true;
    connection.start().catch((err) => {
      if (!isMounted) return;
      if (err?.message?.includes("stop() was called")) return;
    });

    return () => {
      isMounted = false;
      connection.stop();
    };
  }, [accessToken, isAuthenticated, queryClient]);

  useEffect(() => {
    let cancelled = false;

    async function markShellReady() {
      if (document.readyState !== "complete") {
        await new Promise<void>((resolve) => {
          window.addEventListener("load", () => resolve(), { once: true });
        });
      }

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      if (!cancelled) {
        setHasShellLoaded(true);
      }
    }

    markShellReady();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoading) return;

    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverscroll = document.documentElement.style.overscrollBehavior;
    const bodyOverscroll = document.body.style.overscrollBehavior;
    const bodyPosition = document.body.style.position;
    const bodyInset = document.body.style.inset;
    const bodyWidth = document.body.style.width;
    const preventScroll = (event: Event) => event.preventDefault();

    window.scrollTo(0, 0);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";
    document.body.style.position = "fixed";
    document.body.style.inset = "0";
    document.body.style.width = "100%";
    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });

    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overscrollBehavior = htmlOverscroll;
      document.body.style.overscrollBehavior = bodyOverscroll;
      document.body.style.position = bodyPosition;
      document.body.style.inset = bodyInset;
      document.body.style.width = bodyWidth;
      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
    };
  }, [isLoading]);

  function handleNavClick(
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) {
    event.preventDefault();
    setActiveSection(sectionId);
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", `#${sectionId}`);
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading ? (
          <LoadingScreen onComplete={() => setHasLoaderFinished(true)} />
        ) : null}
      </AnimatePresence>

      <div
        style={{
          opacity: isLoading ? 0 : 1,
          transition: "opacity 0.5s ease-out",
        }}
      >
        <main
          id="about"
          className="relative min-h-screen overflow-hidden bg-[#000000] scroll-mt-20 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] font-normal text-white antialiased"
        >
          <VideoPlayer onReady={() => setHasHeroVideoLoaded(true)} />

          <header className="fixed left-0 right-0 top-0 z-30 px-5 py-5 md:px-8 lg:px-12">
            <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-4 py-3 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <Link
                href="/"
                className="flex items-center rounded-full border border-black bg-black px-4 py-2 transition-colors hover:bg-black"
                aria-label="WarpTalk home"
              >
                <WarpTalkNavLogo />
              </Link>

              <div className="hidden items-center gap-2 text-sm text-white/62 md:flex">
                {navLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.href}
                    onClick={(event) => handleNavClick(event, link.id)}
                    className="relative rounded-full px-4 py-2 transition-colors hover:text-white"
                  >
                    {activeSection === link.id ? (
                      <motion.span
                        layoutId="landing-nav-active"
                        className="absolute inset-0 rounded-full border border-white/35 bg-black/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                        transition={{
                          type: "spring",
                          stiffness: 360,
                          damping: 34,
                        }}
                      />
                    ) : null}
                    <span
                      data-nav-active={
                        activeSection === link.id ? "true" : undefined
                      }
                      className={
                        activeSection === link.id
                          ? "relative z-10 text-white"
                          : "relative z-10"
                      }
                    >
                      {t(`nav.${link.id}`)}
                    </span>
                  </a>
                ))}

                {/* WT-584. A real route, so it cannot live in navLinks: every entry there is a
                    same-page anchor driven by handleNavClick and the scroll-spy, and giving one
                    of them an href to another page would either be swallowed by
                    preventDefault or make the spy hunt for a section that does not exist.
                    /download was reachable only by typing the URL — the signed-in workspace
                    dropdown linked to it, which is no use to the visitor it was written for. */}
                <Link
                  href="/download"
                  className="relative rounded-full px-4 py-2 transition-colors hover:text-white"
                >
                  <span className="relative z-10">{t("nav.download")}</span>
                </Link>
              </div>

              <div className="flex items-center gap-3">
                <LanguageSwitcher className="border-white/15 bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white" />

                <button
                  type="button"
                  onClick={handleGetStarted}
                  className="rounded-xl bg-gradient-to-b from-white to-neutral-300 px-5 py-2.5 text-sm font-medium text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:from-white hover:to-white"
                >
                  {t("nav.getStarted")}
                </button>
              </div>
            </nav>
          </header>

          <section className="relative z-10 flex min-h-screen items-center justify-center px-5 pb-36 pt-32 text-center md:px-8 lg:px-12">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="mx-auto flex w-full max-w-6xl flex-col items-center"
            >
              <motion.div
                variants={itemVariants}
                className="relative top-[clamp(-8rem,-12vh,-5rem)] mb-7 flex flex-wrap justify-center gap-3"
              >
                {badgeKeys.map((key) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md"
                  >
                    <BadgeIcon />
                    <span>{t(`badges.${key}`)}</span>
                  </div>
                ))}
              </motion.div>

              {/*
                Japanese needs its own leading and tracking. `leading-[0.92]` is a line box
                SHORTER than the font size, which only works because Latin glyphs leave slack
                above the cap height — a CJK glyph fills its em box, so at 0.92 the two lines
                of the Japanese headline physically overlapped. The negative letter-spacing is
                dropped for the same reason: it is tuned for Latin sidebearings and crowds
                kana/kanji.
              */}
              <motion.h1
                variants={itemVariants}
                className={cn(
                  "max-w-5xl text-[3.25rem] font-normal text-white md:text-[5rem] lg:text-[6.1rem]",
                  locale === "ja"
                    ? "leading-[1.14] tracking-[-0.02em]"
                    : "leading-[0.92] tracking-[-0.065em]",
                )}
              >
                {t("hero.title")}
              </motion.h1>

              <motion.p
                variants={itemVariants}
                className="mt-6 max-w-2xl text-base leading-7 text-white/58 md:text-lg"
              >
                {t("hero.subtitle")}
              </motion.p>

              <motion.div
                variants={itemVariants}
                className="mt-9 flex flex-wrap justify-center gap-4"
              >
                <button
                  type="button"
                  onClick={handleGetStarted}
                  className="rounded-xl border border-white/55 bg-black px-7 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition-colors hover:bg-white hover:text-black cursor-pointer"
                >
                  {t("hero.getStarted")}
                </button>
                {/*
                  Both hero CTAs used to lead to /login, and the login screen
                  had no sign-up control — so a visitor without an account had
                  no route to /register except typing the URL. This one now
                  says what it does and goes where it says.
                */}
                <Link
                  href="/register"
                  className="rounded-xl border border-white/10 bg-white/[0.06] px-7 py-3 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white hover:text-black"
                >
                  {t("hero.createAccount")}
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
        <FeatureTraceSection />
        <PricingSection />
        <LandingFooter />
      </div>
    </>
  );
}
