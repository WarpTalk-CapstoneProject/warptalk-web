"use client";

import { memo, useEffect, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import Hls from "hls.js";
import { AnimatePresence, motion, useScroll, useSpring } from "motion/react";
import type { Variants } from "motion/react";

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

const featureSteps = [
  {
    number: "01",
    kicker: "Signal Drift",
    title: "Every voice leaves a trace.",
    markers: ["live", "low latency", "room signal"],
  },
  {
    number: "02",
    kicker: "Language Crossing",
    title: "Meaning crosses over.",
    markers: ["xin chao", "hello", "bonjour", "konnichiwa"],
  },
  {
    number: "03",
    kicker: "The Pause",
    title: "The conversation keeps moving while the signal changes form.",
    compact: true,
  },
  {
    number: "04",
    kicker: "Memory Bloom",
    title: "The room remembers.",
    markers: ["decisions", "questions", "next steps", "names"],
  },
];

const signalRows = [
  { number: "01", meta: "Capture / STT / Audio", label: "Capture", pattern: "wave" },
  { number: "02", meta: "Understand / Context / Memory", label: "Understand", pattern: "ring" },
  { number: "03", meta: "Translate / AI / Language", label: "Translate", pattern: "sine" },
  { number: "04", meta: "Speak / TTS / Voice", label: "Speak", pattern: "orb" },
  { number: "05", meta: "Remember / Transcript / Assistant", label: "Remember", pattern: "arc" },
];

const pricingPlans = [
  {
    tier: "Free",
    monthly: "Free",
    yearly: "Free",
    description: "For teams trying real-time interpretation across first conversations.",
    features: [
      "Up to 3 live translation rooms each month",
      "Real-time captions for bilingual meetings",
      "Basic transcript export",
      "Web access for small teams",
      "Community support",
    ],
  },
  {
    tier: "Standard",
    monthly: "$9,99/m",
    yearly: "$99,99/y",
    description: "For growing global teams that need reliable AI summaries and history.",
    features: [
      "Up to 50 live translation rooms each month",
      "AI meeting summary and action items",
      "Speaker timeline and transcript search",
      "Team collaboration up to 5 members",
      "Priority web and mobile access",
    ],
  },
  {
    tier: "Pro",
    monthly: "$19,99/m",
    yearly: "$199,99/y",
    description: "For operators using voice cloning and native-feeling interpretation at scale.",
    features: [
      "Unlimited live translation rooms",
      "Human voice cloning for supported speakers",
      "Advanced AI analysis and conversation insights",
      "Unlimited team members",
      "Brand and workspace customization",
    ],
    featured: true,
  },
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
    <span className="relative block h-9 w-32 overflow-hidden" aria-label="WarpTalk">
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

function FeatureTraceSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 72%", "end 24%"],
  });
  const pathLength = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 24,
    mass: 0.35,
  });

  return (
    <section ref={sectionRef} id="features" className="feature-trace-section scroll-mt-20">
      <div className="feature-trace-bg" aria-hidden="true">
        <svg className="feature-trace-svg" viewBox="0 0 1200 1900" preserveAspectRatio="none">
          <path
            className="feature-trace-path-base"
            d="M112 0 C 32 90 40 190 148 230 C 260 272 236 390 124 426 C 6 465 25 600 150 654 C 262 702 244 840 126 884 C 10 928 38 1068 152 1110 C 276 1156 260 1300 136 1345 C 24 1386 36 1518 170 1566 C 318 1620 428 1512 562 1548 C 724 1592 772 1690 930 1656 C 1040 1632 1100 1712 1190 1690"
          />
          <motion.path
            className="feature-trace-path-live"
            d="M112 0 C 32 90 40 190 148 230 C 260 272 236 390 124 426 C 6 465 25 600 150 654 C 262 702 244 840 126 884 C 10 928 38 1068 152 1110 C 276 1156 260 1300 136 1345 C 24 1386 36 1518 170 1566 C 318 1620 428 1512 562 1548 C 724 1592 772 1690 930 1656 C 1040 1632 1100 1712 1190 1690"
            style={{ pathLength }}
          />
          <motion.circle className="feature-trace-orb" cx="112" cy="0" r="12" style={{ pathLength }} />
        </svg>
      </div>

      <div className="feature-trace-inner">
        <div className="feature-trace-top">
          {featureSteps.map((step) => (
            <motion.article
              className={step.compact ? "feature-step feature-step-compact" : "feature-step"}
              key={step.number}
              initial={{ opacity: 0, y: 36 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="feature-step-index">
                <span>{step.number}</span>
                <small>{step.kicker}</small>
              </div>
              <div className="feature-step-content">
                <h2>{step.title}</h2>
                {step.markers ? (
                  <div className="feature-step-markers">
                    {step.markers.map((marker) => (
                      <span key={marker}>{marker}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </motion.article>
          ))}
          <span className="feature-pause-watermark" aria-hidden="true">
            PAUSE
          </span>
        </div>

        <div className="feature-signal-grid">
          <motion.aside
            className="feature-signal-copy"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <h3>System Signals</h3>
            <p>Five core signals power every conversation across any language.</p>
          </motion.aside>

          <div className="feature-signal-list">
            {signalRows.map((row) => (
              <motion.div
                className="feature-signal-row"
                key={row.number}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
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
          </div>
        </div>

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
  const [yearly, setYearly] = useState(false);

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
          <span className="c3-watermark-line-1">Translation</span>
          <span className="c3-watermark-line-2">Native</span>
        </div>
      </div>

      <div className="c3-grid">
        {pricingPlans.map((plan) => (
          <article className={plan.featured ? "c3-card c3-card-pro" : "c3-card"} key={plan.tier}>
            <p className="c3-tier-small">{plan.tier}</p>
            <h3 className="c3-tier-large">{yearly ? plan.yearly : plan.monthly}</h3>
            <p className="c3-desc">{plan.description}</p>
            <ul className="c3-list">
              {plan.features.map((feature) => (
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
            <button type="button" className="c3-btn">
              Choose Plan
            </button>
          </article>
        ))}
      </div>

      <div className="c3-toggle-wrap">
        <span className="text-sm font-medium text-white/70">Yearly</span>
        <button
          type="button"
          className={yearly ? "c3-toggle active" : "c3-toggle"}
          onClick={() => setYearly((current) => !current)}
          aria-pressed={yearly}
          aria-label="Toggle yearly pricing"
        >
          <span className="c3-toggle-knob" />
        </button>
      </div>
    </section>
  );
}

const footerNavigation = ["How it works", "Features", "Pricing", "Testimonials", "FAQ"];
const footerCompany = ["Blog", "About", "Terms and Condition", "Privacy Policy"];

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
          <div className="footer-lucky-graphic">
            <div className="lucky-cube">
              <span className="lucky-cube-mark">
                <FooterLogoMark large />
              </span>
            </div>
            <div className="lucky-text-row">
              <svg className="lucky-arrow" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 20 C 6 14, 10 9, 18 5" />
                <path d="M18 5 L 12 5" />
                <path d="M18 5 L 18 11" />
              </svg>
              <span className="lucky-text">Feeling lucky?</span>
            </div>
          </div>

          <div className="footer-right-top">
            <div className="footer-nav-cols">
              <div className="footer-col">
                <h3 className="footer-col-title">Navigation</h3>
                {footerNavigation.map((item) => (
                  <a href="#" key={item}>
                    {item}
                  </a>
                ))}
              </div>
              <div className="footer-col">
                <h3 className="footer-col-title">Company</h3>
                {footerCompany.map((item) => (
                  <a href="#" key={item}>
                    {item}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copyright">© 2026 WarpTalk. All rights reserved.</p>
            <div className="footer-cta-mini">
              <h4>
                AI moves fast.
                <br />
                <strong>Stay ahead with WarpTalk.</strong>
              </h4>
              <div className="footer-subscribe-row">
                <input type="email" placeholder="Enter email address" />
                <button type="button">Subscribe</button>
              </div>
            </div>
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
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, sectionId: string) {
    event.preventDefault();
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", `#${sectionId}`);
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading ? <LoadingScreen onComplete={() => setIsLoading(false)} /> : null}
      </AnimatePresence>

      <div style={{ opacity: isLoading ? 0 : 1, transition: "opacity 0.5s ease-out" }}>
        <main
          id="about"
          className="relative min-h-screen overflow-hidden bg-[#000000] scroll-mt-20 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] font-normal text-white antialiased"
        >
          <VideoPlayer />

          <header className="fixed left-0 right-0 top-0 z-30 px-5 py-5 md:px-8 lg:px-12">
            <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-4 py-3 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <Link
                href="/"
                className="flex items-center rounded-full border border-white/10 bg-black/70 px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-black/90"
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

              <Link
                href="/login"
                className="rounded-xl bg-gradient-to-b from-white to-neutral-300 px-5 py-2.5 text-sm font-medium text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:from-white hover:to-white"
              >
                Get Started for Free
              </Link>
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
              <motion.div variants={itemVariants} className="mb-7 flex flex-wrap justify-center gap-3">
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
                <Link
                  href="/login"
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
        <FeatureTraceSection />
        <PricingSection />
        <LandingFooter />
      </div>
    </>
  );
}
