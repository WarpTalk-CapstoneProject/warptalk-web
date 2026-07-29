"use client";

import { memo, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import Hls from "hls.js";
import { AnimatePresence, motion, useScroll, useTransform } from "motion/react";
import type { MotionValue, Variants } from "motion/react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import type { PlanDto, SalesPackagePricingEstimateDto } from "@/types/billing";
import { BROADCAST_CHANNELS } from "@/constants/realtime";

const VIDEO_SRC =
  "https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8";

const navLinks = [
  { id: "about", label: "About", href: "#about" },
  { id: "features", label: "Feature", href: "#features" },
  { id: "pricing", label: "Pricing", href: "#pricing" },
  { id: "contact", label: "Contact", href: "#contact" },
];

const badges = ["Real-time Translation", "AI Summary Analysis", "Human Voice Cloning"];
const logos = ["NOVA", "AXIS", "ORBIT", "PRISM", "LUMA", "ECHO"];
const loaderWords = ["Translation", "Clone Voice", "AI"];

const sampleEnterprisePlan = {
  name: "Enterprise",
  price: 1900000,
  currency: "VND",
  creditsPerCycle: 700000,
  overageCapCredits: 105000,
  overagePricePerCredit: 4,
  invoiceTermsDays: 15,
  rolloverCapCredits: 700000,
};

const pricingVolumes = [
  { label: "Under 50 hours", value: 35 },
  { label: "50-250 hours", value: 150 },
  { label: "250-1,000 hours", value: 500 },
  { label: "1,000+ hours", value: 1000 },
];

const pricingCapabilities = ["Vietnamese", "English", "Japanese", "Translated audio / dubbing"];
const pricingCapabilityOrder = new Map(pricingCapabilities.map((capability, index) => [capability, index]));

const pricingCreditEstimate = {
  sttCreditsPerHour: 4764,
  translationCreditsPerOutputLanguageHour: 2510,
  summaryCreditsPerHour: 30,
  assistantCreditsPerHour: 198,
  translatedAudioCreditsPerOutputLanguageHour: 24356,
};

function getPricingVolumeLabel(hours: number) {
  if (hours < 50) return pricingVolumes[0].label;
  if (hours <= 250) return pricingVolumes[1].label;
  if (hours <= 1000) return pricingVolumes[2].label;
  return pricingVolumes[3].label;
}

function calculatePricingEstimate(
  targetLanguageCount: number,
  selectedFeatures: string[],
  includesTranslatedAudio: boolean
) {
  const hasTranslation = selectedFeatures.includes("translation") || includesTranslatedAudio;
  const hasSummary = selectedFeatures.includes("summaries");
  const hasAssistant = selectedFeatures.includes("assistant");
  const hasVoicePreview = selectedFeatures.includes("voice") || includesTranslatedAudio;
  const breakdown: string[] = [];
  let creditsPerHour = 0;

  if (hasTranslation) {
    creditsPerHour += pricingCreditEstimate.sttCreditsPerHour;
    breakdown.push("STT");

    const translationCredits = pricingCreditEstimate.translationCreditsPerOutputLanguageHour * targetLanguageCount;
    creditsPerHour += translationCredits;
    breakdown.push(`Translation x${targetLanguageCount}`);
  }

  if (hasVoicePreview) {
    const audioCredits = pricingCreditEstimate.translatedAudioCreditsPerOutputLanguageHour * targetLanguageCount;
    creditsPerHour += audioCredits;
    breakdown.push(`Translated audio x${targetLanguageCount}`);
  }

  if (hasSummary) {
    creditsPerHour += pricingCreditEstimate.summaryCreditsPerHour;
    breakdown.push("AI summaries");
  }

  if (hasAssistant) {
    creditsPerHour += pricingCreditEstimate.assistantCreditsPerHour;
    breakdown.push("AI Assistant");
  }

  return { creditsPerHour, breakdown };
}

const salesInquiryInitialState = {
  firstName: "",
  lastName: "",
  workEmail: "",
  company: "",
  helpTopic: "",
  currentMeetingVolume: "",
  expectedMeetingVolume: "",
  targetLanguages: [] as string[],
  featureInterests: [] as string[],
  message: "",
  consent: false,
};

const salesLanguageOptions = [
  { label: "Vietnamese", value: "vi" },
  { label: "English", value: "en" },
  { label: "Japanese", value: "ja" },
];

const salesFeatureOptions = [
  { label: "Real-time translation", value: "translation" },
  { label: "AI summaries", value: "summaries" },
  { label: "AI Assistant", value: "assistant" },
  { label: "Voice preview", value: "voice" },
  { label: "Google Meet integration", value: "google_meet" },
];

const salesVolumeOptions = [
  { label: "Under 50 hours", value: "under-50" },
  { label: "50-250 hours", value: "50-250" },
  { label: "250-1,000 hours", value: "250-1000" },
  { label: "1,000+ hours", value: "1000-plus" },
];

const salesIntentStorageKey = "warptalk:sales-package-intent";
const pricingIntentStorageKey = "warptalk:pricing-intent";

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPricingEstimateIntent(): SalesPackagePricingEstimateDto | null {
  try {
    const rawIntent = window.sessionStorage.getItem(pricingIntentStorageKey);
    if (!rawIntent) return null;

    const intent = JSON.parse(rawIntent) as Record<string, unknown>;
    const estimatedCredits = readOptionalNumber(intent.estimatedCredits);
    const meetingHours = readOptionalNumber(intent.meetingHours);

    if (estimatedCredits === null && meetingHours === null) return null;

    return {
      packageMode: readOptionalString(intent.packageMode),
      selectedVolume: readOptionalString(intent.selectedVolume),
      meetingHours,
      estimatedCredits,
      usagePercent: readOptionalNumber(intent.usagePercent),
      creditsPerHour: readOptionalNumber(intent.creditsPerHour),
      estimateBreakdown: Array.isArray(intent.estimateBreakdown)
        ? intent.estimateBreakdown.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [],
      targetLanguageCount: readOptionalNumber(intent.targetLanguageCount),
      billableTargetLanguageCount: readOptionalNumber(intent.billableTargetLanguageCount),
      includesTranslatedAudio: intent.includesTranslatedAudio === true,
      planName: readOptionalString(intent.planName),
      planPrice: readOptionalNumber(intent.planPrice),
      creditsPerCycle: readOptionalNumber(intent.creditsPerCycle),
    };
  } catch {
    window.sessionStorage.removeItem(pricingIntentStorageKey);
    return null;
  }
}

function readPricingContactDefaults() {
  try {
    const rawIntent = window.sessionStorage.getItem(pricingIntentStorageKey);
    if (!rawIntent) return null;

    const intent = JSON.parse(rawIntent) as Record<string, unknown>;
    const selectedFeatures = Array.isArray(intent.selectedFeatures)
      ? intent.selectedFeatures.filter((feature): feature is string =>
          typeof feature === "string" && salesFeatureOptions.some((option) => option.value === feature)
        )
      : [];
    const selectedCapabilities = Array.isArray(intent.selectedCapabilities)
      ? intent.selectedCapabilities.filter((capability): capability is string => typeof capability === "string")
      : [];
    const targetLanguages = salesLanguageOptions
      .filter((language) => selectedCapabilities.includes(language.label))
      .map((language) => language.value);
    const volumeLabel = readOptionalString(intent.selectedVolume);
    const currentMonthlyMeetingVolume = salesVolumeOptions.find((option) => option.label === volumeLabel)?.value ?? "";

    return {
      featureInterests: selectedFeatures,
      targetLanguages,
      currentMonthlyMeetingVolume,
    };
  } catch {
    window.sessionStorage.removeItem(pricingIntentStorageKey);
    return null;
  }
}

const featureSteps = [
  {
    number: "01",
    kicker: "Signal Drift",
    title: "Every voice leaves a trace.",
  },
  {
    number: "02",
    kicker: "Language Crossing",
    title: "Meaning crosses over.",
  },
  {
    number: "03",
    kicker: "The Pause",
    title: "The conversation keeps moving while the signal changes form.",
  },
  {
    number: "04",
    kicker: "Memory Bloom",
    title: "The room remembers.",
  },
];

const signalRows = [
  { number: "01", meta: "Capture / STT / Audio", label: "Capture", pattern: "wave" },
  { number: "02", meta: "Understand / Context / Memory", label: "Understand", pattern: "ring" },
  { number: "03", meta: "Translate / AI / Language", label: "Translate", pattern: "sine" },
  { number: "04", meta: "Speak / TTS / Voice", label: "Speak", pattern: "orb" },
  { number: "05", meta: "Remember / Transcript / Assistant", label: "Remember", pattern: "arc" },
];



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

const VideoPlayer = memo(function VideoPlayer({ onReady }: { onReady: () => void }) {
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
        <rect x="4" y="4" width="24" height="24" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 17h12M16 10v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="text-sm font-medium tracking-[0.24em]">{label}</span>
    </div>
  );
}

function WarpTalkNavLogo() {
  return (
    <span className="relative block h-9 w-32 overflow-hidden bg-black" aria-label="WarpTalk">
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
  const labelOpacity = useTransform(progress, [Math.max(0, revealAt - 0.12), revealAt], [0, 1]);
  const tickLength = useTransform(progress, [Math.max(0, revealAt - 0.2), revealAt], [0, 1]);
  const nodeScale = useTransform(progress, [Math.max(0, revealAt - 0.08), revealAt], [0, 1]);

  return (
    <motion.g className="feature-branch-label" style={{ opacity: labelOpacity }}>
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
      <text className={align === "start" ? "feature-branch-label-start" : undefined} x={x} y={y}>
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
  const labelOpacity = useTransform(progress, [Math.max(0, revealAt - 0.1), revealAt], [0, 1]);

  return (
    <motion.text className="feature-branch-label-start" x={x} y={y} style={{ opacity: labelOpacity }}>
      {label}
    </motion.text>
  );
}

function FeatureStoryBoard() {
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
  const driftForkOpacity = useTransform(driftForkProgress, [0.04, 0.12], [0, 1]);
  const crossingTrunkProgress = useTransform(crossingProgress, [0, 0.38], [0, 1]);
  const crossingForkProgress = useTransform(crossingProgress, [0.38, 1], [0, 1]);
  const crossingForkOpacity = useTransform(crossingForkProgress, [0.04, 0.12], [0, 1]);
  const pauseTrunkProgress = useTransform(pauseProgress, [0, 0.58], [0, 1]);
  const pauseForkProgress = useTransform(pauseProgress, [0.58, 1], [0, 1]);
  const pauseForkOpacity = useTransform(pauseForkProgress, [0.04, 0.12], [0, 1]);
  const memoryTrunkProgress = useTransform(memoryProgress, [0, 0.46], [0, 1]);
  const memoryForkProgress = useTransform(memoryProgress, [0.46, 1], [0, 1]);
  const memoryForkOpacity = useTransform(memoryForkProgress, [0.04, 0.12], [0, 1]);
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
              style={{ pathLength: driftForkProgress, opacity: driftForkOpacity }}
            />
          ))}
          <BranchLabel x={586} y={484} tickTop={372} tickBottom={454} label="live" progress={driftForkProgress} revealAt={0.28} />
          <BranchLabel x={820} y={484} tickTop={368} tickBottom={454} label="low latency" progress={driftForkProgress} revealAt={0.58} />
          <BranchLabel x={1016} y={484} tickTop={372} tickBottom={454} label="room signal" progress={driftForkProgress} revealAt={0.86} />
        </g>

        <g>
          <motion.path
            className="feature-story-branch"
            d="M108 620 C 176 664 246 720 370 720 H488"
            style={{ pathLength: crossingTrunkProgress, opacity: crossingOpacity }}
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
              style={{ pathLength: crossingForkProgress, opacity: crossingForkOpacity }}
            />
          ))}
          <BranchLabel x={594} y={652} tickTop={646} tickBottom={696} label="xin chao" progress={crossingForkProgress} revealAt={0.24} />
          <BranchLabel x={756} y={686} tickTop={668} tickBottom={730} label="hello" progress={crossingForkProgress} revealAt={0.46} />
          <BranchLabel x={908} y={628} tickTop={626} tickBottom={682} label="bonjour" progress={crossingForkProgress} revealAt={0.66} />
          <BranchLabel x={1012} y={808} tickTop={742} tickBottom={800} label="konnichiwa" progress={crossingForkProgress} revealAt={0.84} />
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
              style={{ pathLength: memoryForkProgress, opacity: memoryForkOpacity }}
            />
          ))}
          <BranchTextLabel x={982} y={1662} label="decisions" progress={memoryForkProgress} revealAt={0.54} />
          <BranchTextLabel x={982} y={1708} label="questions" progress={memoryForkProgress} revealAt={0.62} />
          <BranchTextLabel x={982} y={1754} label="next steps" progress={memoryForkProgress} revealAt={0.7} />
          <BranchTextLabel x={982} y={1800} label="names" progress={memoryForkProgress} revealAt={0.78} />
        </g>

        {[2254, 2346, 2438, 2530, 2622].map((point, index) => (
          <g key={point}>
            <motion.path
              className="feature-story-signal-row-line"
              d={`M214 ${point} H1094`}
              style={{ pathLength: signalLineProgress[index], opacity: signalLineProgress[index] }}
            />
            <motion.circle
              className="feature-story-signal-dot"
              cx="226"
              cy={point}
              r="4.5"
              style={{ opacity: signalDotProgress[index], scale: signalDotProgress[index] }}
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
            <small>{step.kicker}</small>
          </div>
          <h2>{step.title}</h2>
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
          <h3>System Signals</h3>
          <p>Five core signals power every conversation across any language.</p>
        </motion.aside>

        <motion.div className="feature-signal-list" style={{ opacity: signalCopyOpacity }}>
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
                <small>{row.meta}</small>
                <strong>{row.label}</strong>
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
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 76%", "end 18%"],
  });
  const pathLength = scrollYProgress;

  return (
    <section ref={sectionRef} id="features" className="feature-trace-section scroll-mt-20">
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
            <h2>
              Voice
              <br />
              returns
              <br />
              human.
            </h2>
          </motion.div>
          <div className="feature-wave-panel">
            <div className="feature-wave-labels">
              <span>tone</span>
              <span>intent</span>
              <span>pace</span>
              <span>native flow</span>
            </div>
            <svg viewBox="0 0 900 220" aria-hidden="true">
              <path className="feature-wave-base" d="M0 130 C 90 78 150 78 238 132 S 384 182 470 110 650 58 752 126 850 172 900 122" />
              <motion.path
                className="feature-wave-live"
                d="M0 130 C 90 78 150 78 238 132 S 384 182 470 110 650 58 752 126 850 172 900 122"
                style={{ pathLength }}
              />
              <path className="feature-wave-dots" d="M410 126 C 500 86 600 88 690 132 S 825 176 900 126" />
            </svg>
          </div>
        </div>

        <div className="feature-understand-row">
          <div>
            <h2>When the room understands.</h2>
            <p>No switching tabs. No waiting for summaries. The conversation stays alive.</p>
          </div>
          <div className="feature-language-line">
            <span>hello</span>
            <span>xin chao</span>
            <span>bonjour</span>
            <span>meaning preserved</span>
            <span>voice returned</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const queryClient = useQueryClient();
  const [meetingHours, setMeetingHours] = useState(pricingVolumes[0].value);
  const [selectedPricingFeatures, setSelectedPricingFeatures] = useState<string[]>([
    salesFeatureOptions[0].value,
    salesFeatureOptions[1].value,
  ]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([
    pricingCapabilities[0],
    pricingCapabilities[1],
  ]);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["landing-plans"],
    queryFn: () => billingService.getPlans(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const syncBroadcast = typeof window !== "undefined" && "BroadcastChannel" in window
      ? new BroadcastChannel(BROADCAST_CHANNELS.NOTIFICATIONS_SYNC)
      : null;

    if (syncBroadcast) {
      syncBroadcast.onmessage = (event) => {
        if (event.data === "REFRESH_PLANS") {
          queryClient.invalidateQueries({ queryKey: ["landing-plans"] });
        }
      };
    }

    return () => {
      syncBroadcast?.close();
    };
  }, [queryClient]);

  const activePlans = plans
    .filter((plan: PlanDto) => plan.isActive !== false)
    .sort((a: PlanDto, b: PlanDto) => a.sortOrder - b.sortOrder);
  const primaryPlan = activePlans.find((plan: PlanDto) => plan.slug === "enterprise") ?? activePlans[0];
  const displayPlan = primaryPlan ?? sampleEnterprisePlan;
  const selectedLanguageCount = selectedCapabilities.filter((capability) =>
    ["Vietnamese", "English", "Japanese"].includes(capability)
  ).length;
  const targetLanguageCount = Math.max(0, selectedLanguageCount - 1);
  const billableTargetLanguageCount = Math.max(1, targetLanguageCount);
  const includesTranslatedAudio =
    selectedCapabilities.includes("Translated audio / dubbing") || selectedPricingFeatures.includes("voice");
  const selectedVolumeLabel = getPricingVolumeLabel(meetingHours);
  const pricingEstimate = calculatePricingEstimate(
    billableTargetLanguageCount,
    selectedPricingFeatures,
    includesTranslatedAudio
  );
  const creditsPerHour = pricingEstimate.creditsPerHour;
  const estimateBreakdownText = pricingEstimate.breakdown.length > 0
    ? pricingEstimate.breakdown.join(" + ")
    : "No AI billing features selected";
  const estimatedCredits = Math.round(meetingHours * creditsPerHour);
  const estimateLabel = meetingHours >= 1000 ? "Minimum estimated usage" : "Estimated monthly usage";
  const usagePercent = Math.min(100, Math.round((estimatedCredits / Math.max(displayPlan.creditsPerCycle, 1)) * 100));
  const overBaselineCredits = Math.max(0, estimatedCredits - displayPlan.creditsPerCycle);
  const baselineCoveredHours = creditsPerHour > 0
    ? Math.floor(displayPlan.creditsPerCycle / creditsPerHour)
    : null;
  const isCustomFit = overBaselineCredits > 0 || usagePercent >= 80 || meetingHours >= 1000;
  const packageMode = isCustomFit ? "Custom Enterprise review" : "Enterprise baseline fit";
  const sortedSelectedCapabilities = [...selectedCapabilities].sort(
    (first, second) => (pricingCapabilityOrder.get(first) ?? 999) - (pricingCapabilityOrder.get(second) ?? 999)
  );
  const selectedCapabilitiesText = sortedSelectedCapabilities.length > 0
    ? sortedSelectedCapabilities.join(", ")
    : "No capability selected";
  const selectedPricingFeatureLabels = salesFeatureOptions
    .filter((feature) => selectedPricingFeatures.includes(feature.value))
    .map((feature) => feature.label);
  const selectedPricingFeaturesText = selectedPricingFeatureLabels.length > 0
    ? selectedPricingFeatureLabels.join(", ")
    : "No feature selected";
  const contractHighlights = [
    `Volume: ${meetingHours.toLocaleString()} hours/month (${selectedVolumeLabel})`,
    `Estimated usage: ${estimatedCredits.toLocaleString()} credits`,
    overBaselineCredits > 0
      ? `Over baseline: ${overBaselineCredits.toLocaleString()} credits`
      : "Within baseline allowance",
    `${selectedLanguageCount} selected language${selectedLanguageCount > 1 ? "s" : ""}`,
    `${targetLanguageCount} translated output language${targetLanguageCount !== 1 ? "s" : ""}`,
    includesTranslatedAudio ? "Audio mode: translated audio/dubbing" : "Audio mode: captions only",
    creditsPerHour > 0
      ? `Cost basis: ${creditsPerHour.toLocaleString()} credits/hour`
      : "Cost basis: no AI usage selected",
    baselineCoveredHours !== null
      ? `Baseline covers about ${baselineCoveredHours.toLocaleString()} hours/month for this setup`
      : "Baseline is not consumed until AI features are enabled",
    `Credit drivers: ${estimateBreakdownText}`,
  ];

  const handleContactSales = () => {
    persistPricingIntent();
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", "#contact");
  };

  const persistPricingIntent = () => {
    window.sessionStorage.setItem(
      pricingIntentStorageKey,
      JSON.stringify({
        packageMode,
        selectedVolume: selectedVolumeLabel,
        meetingHours,
        selectedFeatures: selectedPricingFeatures,
        selectedCapabilities: sortedSelectedCapabilities,
        estimatedCredits,
        usagePercent,
        creditsPerHour,
        estimateBreakdown: pricingEstimate.breakdown,
        targetLanguageCount,
        billableTargetLanguageCount,
        includesTranslatedAudio,
        planName: displayPlan.name,
        planPrice: displayPlan.price,
        creditsPerCycle: displayPlan.creditsPerCycle,
        capturedAt: new Date().toISOString(),
      })
    );
    window.dispatchEvent(new Event("warptalk:pricing-intent-updated"));
  };

  const togglePricingChoice = (
    value: string,
    currentValues: string[],
    setter: (values: string[]) => void
  ) => {
    setter(
      currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value]
    );
  };

  return (
    <section id="pricing" className="c3-pricing-section scroll-mt-20 bg-[#0c0c0c] text-white">
      <svg aria-hidden="true" className="pointer-events-none absolute size-0">
        <filter id="c3-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" stitchTiles="stitch" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.075" />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
        </filter>
      </svg>

      <div className="c3-watermark-container">
        <div className="c3-watermark-main">
          <span className="c3-watermark-line-1">Find the</span>
          <span className="c3-watermark-line-2">Right Plan</span>
        </div>
        <p className="c3-pricing-lede">
          Estimate monthly usage against the Enterprise baseline before contract review.
        </p>
      </div>

      <div className="c3-pricing-shell">
        <div className="c3-plan-builder">
          <div className="c3-builder-step">
            <div className="c3-step-marker">1</div>
            <div className="c3-step-content">
              <h3>Expected monthly meeting volume</h3>
              <p>Use meeting hours to check whether the default Enterprise baseline is enough.</p>
              <div className="c3-volume-control">
                <div className="c3-volume-readout">
                  <strong>{meetingHours.toLocaleString()} hours/month</strong>
                  <span>{selectedVolumeLabel}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={5}
                  value={meetingHours}
                  aria-label="Expected monthly meeting hours"
                  onChange={(event) => setMeetingHours(Number(event.target.value))}
                />
                <div className="c3-volume-scale">
                  <span>10h</span>
                  <span>250h</span>
                  <span>500h</span>
                  <span>1,000h+</span>
                </div>
              </div>
              <div className="c3-usage-meter">
                <span style={{ width: `${usagePercent}%` }} />
              </div>
              <p className="c3-meter-caption">
                {estimateLabel}: <strong>{estimatedCredits.toLocaleString()}</strong> / {displayPlan.creditsPerCycle.toLocaleString()} credits
                {overBaselineCredits > 0 ? (
                  <em>Over baseline by {overBaselineCredits.toLocaleString()} credits</em>
                ) : null}
                <small>
                  {creditsPerHour > 0
                    ? `Estimate uses ${creditsPerHour.toLocaleString()} credits/hour for ${billableTargetLanguageCount} billable output language${billableTargetLanguageCount > 1 ? "s" : ""}.`
                    : "No AI usage is estimated until translation, summary, assistant, or voice mode is selected."}
                </small>
              </p>
            </div>
          </div>

          <div className="c3-builder-step">
            <div className="c3-step-marker">2</div>
            <div className="c3-step-content">
              <h3>Features to review</h3>
              <p>Turn meeting modes on or off to update the usage estimate.</p>
              <div className="c3-pill-row">
                {salesFeatureOptions.map((feature) => (
                  <button
                    key={feature.value}
                    type="button"
                    className={selectedPricingFeatures.includes(feature.value) ? "selected" : ""}
                    onClick={() => togglePricingChoice(feature.value, selectedPricingFeatures, setSelectedPricingFeatures)}
                  >
                    {feature.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="c3-builder-step">
            <div className="c3-step-marker">3</div>
            <div className="c3-step-content">
              <h3>Languages and audio mode</h3>
              <p>Select supported languages and whether translated audio/dubbing is required.</p>
              <div className="c3-pill-row">
                {pricingCapabilities.map((capability) => (
                  <button
                    key={capability}
                    type="button"
                    className={selectedCapabilities.includes(capability) ? "selected" : ""}
                    onClick={() => togglePricingChoice(capability, selectedCapabilities, setSelectedCapabilities)}
                  >
                    {capability}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <article className="c3-contract-card">
          <p className="c3-recommend-label">Estimate result</p>
          <div className="c3-contract-main">
            <div>
              <p className="c3-tier-small">{isLoading ? "Loading plan" : packageMode}</p>
              <h3 className="c3-contract-title">Enterprise</h3>
              <p className="c3-contract-price">
                Contract pricing after review
              </p>
              <p className="c3-desc">
                {isCustomFit
                  ? "Estimated usage is above the default baseline, so Sales should confirm credits, caps, and pricing before activation."
                  : `Estimated usage fits the default ${displayPlan.creditsPerCycle.toLocaleString()}-credit baseline. Final terms are still confirmed before activation.`}
              </p>
              <div className="c3-selected-summary">
                <span>Features to review</span>
                <strong>{selectedPricingFeaturesText}</strong>
                <span>Estimate basis</span>
                <strong>{selectedCapabilitiesText}</strong>
                <span>Baseline reference</span>
                <strong>{displayPlan.creditsPerCycle.toLocaleString()} credits / month</strong>
              </div>
            </div>

            <div className="c3-contract-includes">
              <p className="c3-tier-small">Estimate includes</p>
              <ul className="c3-list c3-contract-list">
                {contractHighlights.map((feature) => (
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
            </div>
          </div>

          <button type="button" className="c3-btn cursor-pointer" onClick={handleContactSales}>
            Contact Sales
          </button>

          <p className="c3-pricing-note">
            The baseline is a starting point only. Final price, credit volume, invoice terms, and enabled features are confirmed after review.
          </p>
        </article>
      </div>
    </section>
  );
}

const footerSocialIcons = [
  {
    label: "Discord",
    path: "M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074-.037-.111.037-.148.111-.592 1.072-1.257 2.479-1.257 2.479a18.27 18.27 0 0 0-5.487 0s-.666-1.407-1.258-2.48c-.037-.073-.074-.11-.148-.11A19.736 19.736 0 0 0 3.23 4.37a.136.136 0 0 0-.074.074C.533 8.438-.204 12.318.099 16.15c0 .037.037.074.074.111a19.9 19.9 0 0 0 5.993 3.034c.074.037.148 0 .185-.074.462-.629.873-1.295 1.22-1.998.037-.074 0-.148-.074-.185a13.107 13.107 0 0 1-1.887-.888c-.074-.037-.074-.148-.037-.185.126-.092.252-.185.37-.281.037-.037.111-.037.148-.019a14.26 14.26 0 0 0 12.372 0c.037-.018.111-.018.148.019.118.096.244.189.37.281.037.037.037.148-.037.185-.592.35-1.22.647-1.887.888-.074.037-.111.111-.074.185.37.703.777 1.369 1.22 1.998.037.074.111.111.185.074a19.839 19.839 0 0 0 6.002-3.034c.037-.037.074-.074.074-.111.364-4.473-.613-8.316-3.548-11.706a.123.123 0 0 0-.074-.074ZM8.02 13.747c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.096 2.157 2.418 0 1.334-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.096 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z",
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
    <span className={large ? "footer-logo-mark footer-logo-mark-large" : "footer-logo-mark"}>
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
  const [salesInquiry, setSalesInquiry] = useState(salesInquiryInitialState);
  const [salesInquiryStatus, setSalesInquiryStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [salesStep, setSalesStep] = useState(1);

  useEffect(() => {
    const applyPricingDefaults = () => {
      const defaults = readPricingContactDefaults();
      if (!defaults) return;

      setSalesInquiry((current) => ({
        ...current,
        featureInterests: defaults.featureInterests.length > 0 ? defaults.featureInterests : current.featureInterests,
        targetLanguages: defaults.targetLanguages.length > 0 ? defaults.targetLanguages : current.targetLanguages,
        currentMeetingVolume: defaults.currentMonthlyMeetingVolume || current.currentMeetingVolume,
      }));
    };

    applyPricingDefaults();
    window.addEventListener("warptalk:pricing-intent-updated", applyPricingDefaults);

    return () => {
      window.removeEventListener("warptalk:pricing-intent-updated", applyPricingDefaults);
    };
  }, []);

  useEffect(() => {
    function fitWatermark() {
      const svg = document.getElementById("watermarkSvg");
      const text = document.getElementById("watermarkText") as SVGTextElement | null;
      if (!svg || !text) return;

      try {
        const bbox = text.getBBox();
        svg.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
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

  const persistSalesIntent = () => {
    window.sessionStorage.setItem(
      salesIntentStorageKey,
      JSON.stringify({
        firstName: salesInquiry.firstName.trim(),
        lastName: salesInquiry.lastName.trim(),
        workEmail: salesInquiry.workEmail.trim().toLowerCase(),
        company: salesInquiry.company.trim(),
        requestType: salesInquiry.helpTopic,
        featureInterests: salesInquiry.featureInterests,
        targetLanguages: salesInquiry.targetLanguages,
        currentMonthlyMeetingVolume: salesInquiry.currentMeetingVolume,
        expectedMonthlyMeetingVolumeInSixMonths: salesInquiry.expectedMeetingVolume || null,
        useCaseNotes: salesInquiry.message.trim() || null,
        consent: salesInquiry.consent,
        pricingEstimate: readPricingEstimateIntent(),
        capturedAt: new Date().toISOString(),
      })
    );
  };

  const handleSalesInquirySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitSalesInquiry) {
      return;
    }

    setSalesInquiryStatus("submitting");
    persistSalesIntent();

    try {
      await billingService.createSalesInquiry({
        firstName: salesInquiry.firstName.trim(),
        lastName: salesInquiry.lastName.trim(),
        workEmail: salesInquiry.workEmail.trim().toLowerCase(),
        company: salesInquiry.company.trim(),
        requestType: salesInquiry.helpTopic,
        featureInterests: salesInquiry.featureInterests,
        targetLanguages: salesInquiry.targetLanguages,
        currentMonthlyMeetingVolume: salesInquiry.currentMeetingVolume,
        expectedMonthlyMeetingVolumeInSixMonths: salesInquiry.expectedMeetingVolume || null,
        useCaseNotes: salesInquiry.message.trim() || null,
        pricingEstimate: readPricingEstimateIntent(),
        consent: salesInquiry.consent,
        source: "landing_pricing",
      });
      setSalesInquiryStatus("sent");
    } catch (error) {
      console.error("Failed to submit sales inquiry", error);
      setSalesInquiryStatus("error");
    }
  };

  const toggleSalesLanguage = (language: string) => {
    setSalesInquiry((current) => ({
      ...current,
      targetLanguages: current.targetLanguages.includes(language)
        ? current.targetLanguages.filter((item) => item !== language)
        : [...current.targetLanguages, language],
    }));
  };

  const toggleSalesFeature = (feature: string) => {
    setSalesInquiry((current) => ({
      ...current,
      featureInterests: current.featureInterests.includes(feature)
        ? current.featureInterests.filter((item) => item !== feature)
        : [...current.featureInterests, feature],
    }));
  };

  const canGoToSalesStepTwo =
    salesInquiry.firstName.trim().length > 0 &&
    salesInquiry.lastName.trim().length > 0 &&
    salesInquiry.workEmail.trim().length > 0 &&
    salesInquiry.company.trim().length > 0;

  const canGoToSalesStepThree =
    salesInquiry.helpTopic.trim().length > 0 &&
    salesInquiry.featureInterests.length > 0 &&
    salesInquiry.targetLanguages.length > 0;

  const canSubmitSalesInquiry =
    canGoToSalesStepTwo &&
    canGoToSalesStepThree &&
    salesInquiry.currentMeetingVolume.trim().length > 0 &&
    salesInquiry.consent;

  const goToNextSalesStep = () => {
    if (salesStep === 1 && canGoToSalesStepTwo) setSalesStep(2);
    if (salesStep === 2 && canGoToSalesStepThree) setSalesStep(3);
  };

  return (
    <section id="contact" className="footer-section">
      <div className="footer-wrapper">
        <div className="footer-left">
          <video className="footer-left-video" autoPlay muted loop playsInline preload="auto">
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
              Translation that feels native,
              <br />
              <span>powered by AI.</span>
            </p>
          </div>

          <div className="footer-social-row">
            <span className="footer-social-label">Stay in touch!</span>
            <div className="footer-social-icons" aria-label="Social links">
              {footerSocialIcons.map((icon) => (
                <div className="social-icon" key={icon.label} aria-label={icon.label} role="img">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={icon.path} />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="footer-right">
          <div className="footer-right-top">
            <div className="sales-contact-panel">
              <div className="sales-contact-copy">
                <p className="sales-contact-kicker">Contact sales</p>
                <h3>Tell us about your WarpTalk Enterprise package.</h3>
                <p>
                  Share your team details, target languages, and expected meeting usage. This request does not create
                  an account automatically.
                </p>
                <div className="sales-contact-next">
                  <span>What happens next</span>
                  <ul>
                    <li>We match the request with the right workspace flow.</li>
                    <li>Pricing is confirmed only after the package fits.</li>
                  </ul>
                </div>
              </div>

              <form className="sales-contact-form" onSubmit={handleSalesInquirySubmit}>
                <div className="sales-step-header">
                  <span>Step {salesStep} of 3</span>
                  <div className="sales-step-dots" aria-hidden="true">
                    {[1, 2, 3].map((step) => (
                      <i key={step} className={salesStep >= step ? "active" : ""} />
                    ))}
                  </div>
                </div>

                {salesStep === 1 ? (
                  <div className="sales-form-section">
                    <p className="sales-form-section-title">About you</p>
                  <div className="sales-form-grid two-columns">
                    <label>
                      <span>First name</span>
                      <input
                        required
                        value={salesInquiry.firstName}
                        onChange={(event) => setSalesInquiry((current) => ({ ...current, firstName: event.target.value }))}
                        placeholder="Janve"
                      />
                    </label>
                    <label>
                      <span>Last name</span>
                      <input
                        required
                        value={salesInquiry.lastName}
                        onChange={(event) => setSalesInquiry((current) => ({ ...current, lastName: event.target.value }))}
                        placeholder="Sove"
                      />
                    </label>
                  </div>
                  <div className="sales-form-grid two-columns">
                    <label>
                      <span>Work email</span>
                      <input
                        required
                        type="email"
                        value={salesInquiry.workEmail}
                        onChange={(event) => setSalesInquiry((current) => ({ ...current, workEmail: event.target.value }))}
                        placeholder="name@company.com"
                      />
                    </label>
                    <label>
                      <span>Company</span>
                      <input
                        required
                        value={salesInquiry.company}
                        onChange={(event) => setSalesInquiry((current) => ({ ...current, company: event.target.value }))}
                      placeholder="Company name"
                    />
                  </label>
                </div>
                  </div>
                ) : null}

                {salesStep === 2 ? (
                  <div className="sales-form-section">
                    <p className="sales-form-section-title">What do you need?</p>
                  <label>
                    <span>How can we help you?</span>
                    <select
                      required
                      value={salesInquiry.helpTopic}
                      onChange={(event) => setSalesInquiry((current) => ({ ...current, helpTopic: event.target.value }))}
                    >
                      <option value="" disabled hidden>Select a request type</option>
                      <option value="enterprise-package">Request Enterprise package</option>
                      <option value="billing-invoice">Discuss billing/invoice</option>
                      <option value="support">Support issue</option>
                      <option value="other">Other business request</option>
                    </select>
                  </label>

                  <fieldset className="sales-choice-field">
                    <span>Features interested in</span>
                    <div className="sales-choice-options">
                      {salesFeatureOptions.map((feature) => (
                        <label key={feature.value}>
                          <input
                            type="checkbox"
                            checked={salesInquiry.featureInterests.includes(feature.value)}
                            onChange={() => toggleSalesFeature(feature.value)}
                          />
                          <span>{feature.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="sales-choice-field">
                    <span>Target languages</span>
                    <div className="sales-choice-options">
                      {salesLanguageOptions.map((language) => (
                        <label key={language.value}>
                          <input
                            type="checkbox"
                            checked={salesInquiry.targetLanguages.includes(language.value)}
                            onChange={() => toggleSalesLanguage(language.value)}
                          />
                          <span>{language.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  </div>
                ) : null}

                {salesStep === 3 ? (
                  <div className="sales-form-section">
                    <p className="sales-form-section-title">Usage</p>
                    <div className="sales-form-grid two-columns">
                      <label>
                        <span>Current monthly meeting volume</span>
                        <select
                          required
                          value={salesInquiry.currentMeetingVolume}
                          onChange={(event) => setSalesInquiry((current) => ({ ...current, currentMeetingVolume: event.target.value }))}
                        >
                          <option value="" disabled hidden>Select a range</option>
                          {salesVolumeOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Expected volume in 6 months</span>
                        <select
                          value={salesInquiry.expectedMeetingVolume}
                          onChange={(event) => setSalesInquiry((current) => ({ ...current, expectedMeetingVolume: event.target.value }))}
                        >
                          <option value="" disabled hidden>Select a range</option>
                          {salesVolumeOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label>
                      <span>Tell us more about your use case</span>
                      <textarea
                        value={salesInquiry.message}
                        onChange={(event) => setSalesInquiry((current) => ({ ...current, message: event.target.value }))}
                        placeholder="Team size, meeting type, trial goal, rollout timeline..."
                        rows={4}
                      />
                    </label>

                    <label className="sales-consent-row">
                      <input
                        required
                        type="checkbox"
                        checked={salesInquiry.consent}
                        onChange={(event) => setSalesInquiry((current) => ({ ...current, consent: event.target.checked }))}
                      />
                    <span>I agree that WarpTalk may use this information to contact me about its products and services.</span>
                  </label>
                  </div>
                ) : null}

                <div className="sales-form-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={salesStep === 1 || salesInquiryStatus === "submitting"}
                    onClick={() => setSalesStep((current) => Math.max(1, current - 1))}
                  >
                    Back
                  </button>
                  {salesStep < 3 ? (
                    <button
                      type="button"
                      disabled={
                        salesInquiryStatus === "submitting" ||
                        (salesStep === 1 && !canGoToSalesStepTwo) ||
                        (salesStep === 2 && !canGoToSalesStepThree)
                      }
                      onClick={goToNextSalesStep}
                    >
                      Next
                    </button>
                  ) : (
                    <button type="submit" disabled={salesInquiryStatus === "submitting" || !canSubmitSalesInquiry}>
                      {salesInquiryStatus === "submitting" ? "Sending..." : "Request pricing"}
                    </button>
                  )}
                </div>
                <div className="sales-contact-trial">
                  <span>Want to try first?</span>
                  <Link
                    href="/register"
                    onClick={() => {
                      if (canSubmitSalesInquiry) {
                        persistSalesIntent();
                      }
                    }}
                  >
                    Start a 14-day trial
                  </Link>
                </div>
                {salesInquiryStatus === "sent" ? (
                  <p className="sales-contact-success">
                    Thank you. Thanks for reaching out. Our team will review your request and follow up within 1-2 business days.
                  </p>
                ) : null}
                {salesInquiryStatus === "error" ? (
                  <p className="sales-contact-error">
                    We could not send your pricing request. Please try again in a moment.
                  </p>
                ) : null}
              </form>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copyright">© 2026 WarpTalk. All rights reserved.</p>
          </div>
        </div>
      </div>

      <div className="footer-watermark" aria-hidden="true">
        <svg id="watermarkSvg" viewBox="62 95 876 175" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
          <text id="watermarkText" x="500" y="240" textAnchor="middle" fontSize="320">
            WarpTalk
          </text>
        </svg>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [hasLoaderFinished, setHasLoaderFinished] = useState(false);
  const [hasShellLoaded, setHasShellLoaded] = useState(false);
  const [hasHeroVideoLoaded, setHasHeroVideoLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const isLoading = !hasLoaderFinished || !hasShellLoaded || !hasHeroVideoLoaded;

  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  const handleGetStarted = () => {
    if (!isAuthenticated || !user) {
      router.push("/register");
    } else {
      router.push("/workspace");
    }
  };

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

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, sectionId: string) {
    event.preventDefault();
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", `#${sectionId}`);
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading ? <LoadingScreen onComplete={() => setHasLoaderFinished(true)} /> : null}
      </AnimatePresence>

      <div style={{ opacity: isLoading ? 0 : 1, transition: "opacity 0.5s ease-out" }}>
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
                    key={link.label}
                    href={link.href}
                    onClick={(event) => handleNavClick(event, link.id)}
                    className="relative rounded-full px-4 py-2 transition-colors hover:text-white"
                  >
                    {activeSection === link.id ? (
                      <motion.span
                        layoutId="landing-nav-active"
                        className="absolute inset-0 rounded-full border border-white/35 bg-black/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                        transition={{ type: "spring", stiffness: 360, damping: 34 }}
                      />
                    ) : null}
                    <span
                      data-nav-active={activeSection === link.id ? "true" : undefined}
                      className={activeSection === link.id ? "relative z-10 text-white" : "relative z-10"}
                    >
                      {link.label}
                    </span>
                  </a>
                ))}
              </div>

              <button
                type="button"
                onClick={handleGetStarted}
                className="rounded-xl bg-gradient-to-b from-white to-neutral-300 px-5 py-2.5 text-sm font-medium text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:from-white hover:to-white"
              >
                Get Started for Free
              </button>
            </nav>
          </header>

          <section
            className="relative z-10 flex min-h-screen items-center justify-center px-5 pb-36 pt-32 text-center md:px-8 lg:px-12"
          >
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
                {badges.map((badge) => (
                  <div
                    key={badge}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md"
                  >
                    <BadgeIcon />
                    <span>{badge}</span>
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
                <button
                  type="button"
                  onClick={handleGetStarted}
                  className="rounded-xl border border-white/55 bg-black px-7 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition-colors hover:bg-white hover:text-black cursor-pointer"
                >
                  Get Started for Free
                </button>
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
        <FeatureTraceSection />
        <PricingSection />
        <LandingFooter />
      </div>
    </>
  );
}
