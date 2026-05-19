"use client";

import { useState } from "react";
import {
  Archive,
  Check,
  ChevronRight,
  FileText,
  Inbox,
  Menu,
  MoreHorizontal,
  Paperclip,
  Reply,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";

const gradientStyle = {
  backgroundImage:
    "linear-gradient(to right, #091020 0%, #0B2551 12.5%, #A4F4FD 32.5%, #00d2ff 50%, #0B2551 67.5%, #091020 87.5%, #091020 100%)",
  backgroundSize: "200% auto",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
  filter: "url(#c3-noise)",
};

function AppleLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 384 512"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  );
}

function AppleButton({
  label = "Download Aura",
  full = false,
}: {
  label?: string;
  full?: boolean;
}) {
  return (
    <button
      className={`group inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98] ${
        full ? "w-full" : ""
      }`}
      type="button"
    >
      <AppleLogo />
      <span>{label}</span>
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-px" />
    </button>
  );
}

function SectionEyebrow({
  label,
  tag,
}: {
  label: string;
  tag?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 text-xs font-medium text-white/70">
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      <span>{label}</span>
      {tag && (
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/50">
          {tag}
        </span>
      )}
    </div>
  );
}

function RootNoiseFilter() {
  return (
    <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
      <defs>
        <filter id="c3-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0"
          />
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
        </filter>
      </defs>
    </svg>
  );
}

function Navbar() {
  const links = ["Solutions", "Pricing", "Blog", "Documentation", "Careers"];

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6"
    >
      <LogoMark />
      <div className="hidden items-center gap-8 md:flex">
        {links.map((link, index) => (
          <motion.a
            key={link}
            href="#"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.05, duration: 0.45 }}
            className="text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            {link}
          </motion.a>
        ))}
      </div>
      <div className="hidden md:block">
        <AppleButton />
      </div>
      <button
        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 md:hidden"
        type="button"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
    </motion.nav>
  );
}

function Hero() {
  return (
    <section className="relative z-10 flex w-full max-w-[100vw] flex-col items-center overflow-hidden px-6 pb-20 pt-16 text-center md:pt-28">
      <motion.h1
        initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="text-4xl font-semibold leading-[0.9] tracking-tight md:text-7xl"
      >
        <span>Your email.</span>
        <br />
        <span className="animate-shiny" style={gradientStyle}>
          Revitalized
        </span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7 }}
        className="mx-auto mt-8 w-60 min-w-0 text-sm leading-[1.5] text-white/60 md:w-full md:max-w-md md:text-base"
      >
        Aura is the premier inbox platform for the current era. It leverages
        powerful AI to organize, prioritize, and refine your messages into total
        clarity.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.7 }}
        className="mt-8 flex flex-col items-center gap-3"
      >
        <AppleButton />
        <p className="text-xs text-white/40">Download for Intel / Apple Silicon</p>
      </motion.div>
    </section>
  );
}

function MenuBarStrip() {
  const menuItems = ["File", "Edit", "View", "Go", "Window", "Help"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.9, duration: 0.65 }}
      className="relative z-10 h-10 border-y border-white/10 bg-black/40 backdrop-blur-md"
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6 text-xs">
        <div className="flex items-center gap-4">
          <AppleLogo className="h-3.5 w-3.5" />
          <span className="font-bold text-white">Aura</span>
          {menuItems.map((item, index) => (
            <span
              key={item}
              className={`text-white/60 ${index > 2 ? "hidden sm:inline" : ""} ${
                index > 3 ? "md:inline" : ""
              }`}
            >
              {item}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-white/60">
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Wed May 6 1:09 PM</span>
        </div>
      </div>
    </motion.div>
  );
}

const navItems = [
  { icon: Inbox, label: "Inbox", count: 12, active: true },
  { icon: Star, label: "Starred", count: 3 },
  { icon: Send, label: "Sent" },
  { icon: FileText, label: "Drafts", count: 2 },
  { icon: Archive, label: "Archive" },
  { icon: Trash2, label: "Trash" },
];

const messages = [
  {
    name: "Linear",
    subject: "Weekly product digest",
    preview: "Your team shipped 23 issues this week...",
    time: "9:41 AM",
    unread: true,
    active: true,
  },
  {
    name: "Sophia Chen",
    subject: "Re: Q3 roadmap review",
    preview: "Thanks for sending the deck over. I had a few thoughts...",
    time: "8:12 AM",
    unread: true,
  },
  {
    name: "Figma",
    subject: "Marcus commented on your file",
    preview: "Love the new direction on the landing hero.",
    time: "Yesterday",
  },
  {
    name: "Stripe",
    subject: "Payout of $12,480.00 sent",
    preview: "Your payout is on its way to your bank...",
    time: "Yesterday",
  },
  {
    name: "Vercel",
    subject: "Deployment ready for aura-web",
    preview: "Preview is live at aura-web-g3f.vercel.app",
    time: "Mon",
  },
  {
    name: "GitHub",
    subject: "[aura/core] PR #482 approved",
    preview: "david-lim approved your pull request.",
    time: "Mon",
  },
];

function InboxMockup() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-16 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-x-auto overflow-y-hidden rounded-2xl border border-white/10 bg-[#0e1014]/90 backdrop-blur-2xl"
      >
        <div className="relative flex h-10 items-center border-b border-white/10 px-4">
          <div className="flex gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 text-xs text-white/50">
            Aura — Inbox
          </span>
        </div>
        <div className="grid min-w-[900px] grid-cols-12 md:h-[520px]">
          <aside className="col-span-3 border-r border-white/10 bg-black/30 p-4">
            <button className="mb-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black">
              <Sparkles className="h-3.5 w-3.5" />
              Compose with Aura
            </button>
            <div className="space-y-1">
              {navItems.map(({ icon: Icon, label, count, active }) => (
                <button
                  key={label}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5"
                  }`}
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                  {count && <span>{count}</span>}
                </button>
              ))}
            </div>
            <div className="mt-8">
              <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-white/30">
                Labels
              </p>
              {[
                ["Work", "#00d2ff"],
                ["Personal", "#A4F4FD"],
                ["Travel", "#f59e0b"],
                ["Finance", "#10b981"],
              ].map(([label, color]) => (
                <div key={label} className="flex items-center gap-2 py-1.5 text-xs text-white/55">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </div>
              ))}
            </div>
          </aside>
          <div className="col-span-4 border-r border-white/10">
            <div className="flex h-12 items-center gap-2 border-b border-white/10 px-4 text-xs text-white/35">
              <Search className="h-4 w-4" />
              <span>Search mail</span>
            </div>
            {messages.map((message) => (
              <div
                key={message.subject}
                className={`border-b border-white/10 p-4 ${
                  message.active ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{message.name}</span>
                  <span className="text-[10px] text-white/40">{message.time}</span>
                </div>
                <p className="text-xs font-medium text-white/80">{message.subject}</p>
                <p className="mt-1 line-clamp-1 text-xs text-white/40">
                  {message.preview}
                </p>
                {message.unread && <span className="mt-2 block h-1.5 w-1.5 rounded-full bg-[#00d2ff]" />}
              </div>
            ))}
          </div>
          <article className="col-span-5 p-5">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex gap-1">
                {[Reply, Send, Archive, Trash2].map((Icon, index) => (
                  <button
                    key={index}
                    className="grid h-7 w-7 place-items-center rounded-md text-white/55 hover:bg-white/5"
                    type="button"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              <button className="grid h-7 w-7 place-items-center rounded-md text-white/55 hover:bg-white/5" type="button">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Weekly product digest</h2>
            <div className="mt-4 flex items-center gap-3">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#00d2ff] to-[#0B2551] text-xs font-bold">
                L
              </div>
              <div className="text-xs">
                <p className="font-medium text-white">Linear</p>
                <p className="text-white/40">to me · 9:41 AM</p>
              </div>
              <span className="ml-auto rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/50">
                Work
              </span>
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-[#A4F4FD]" />
                Summary by Aura
              </div>
              <p className="text-sm leading-[1.6] text-white/65">
                Your team closed 23 issues, merged 14 PRs, and shipped 2
                features. Top contributor: Marcus. No action needed.
              </p>
            </div>
            <div className="mt-6 space-y-4 text-sm leading-[1.6] text-white/70">
              <p>Hi team,</p>
              <p>
                Here is your weekly digest of everything happening across your
                projects. This was a strong week with significant progress on
                the Q3 roadmap.
              </p>
              <p>
                Twenty-three issues were closed, fourteen pull requests were
                merged, and two customer-facing features went out. The velocity
                trend continues to climb.
              </p>
              <p>
                Let me know if you would like a deeper breakdown by project or
                contributor.
              </p>
              <p className="text-white/50">— The Linear team</p>
            </div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/65">
              <Paperclip className="h-3.5 w-3.5" />
              digest-may-6.pdf
            </div>
          </article>
        </div>
      </motion.div>
    </section>
  );
}

function FeatureTriage() {
  const groups = [
    {
      title: "Priority",
      count: 4,
      color: "#ffffff",
      items: ["Sophia Chen — Q3 review", "David Lim — contract signoff"],
    },
    {
      title: "Follow-up",
      count: 7,
      color: "#e5e5e5",
      items: ["Marcus — design review", "Figma — comment thread"],
    },
    {
      title: "Updates",
      count: 18,
      color: "#a3a3a3",
      items: ["Vercel — deploy ready", "GitHub — PR #482 merged"],
    },
    {
      title: "Archived",
      count: 13,
      color: "#525252",
      items: ["Stripe payout · Newsletter · Receipts"],
    },
  ];

  return (
    <section className="relative z-10 mx-auto grid max-w-6xl items-start gap-10 px-6 py-20 md:grid-cols-2 md:gap-16 md:py-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 0.7 }}
      >
        <SectionEyebrow label="Triage" tag="AI-native" />
        <h2 className="mt-5 text-3xl font-semibold leading-[1.02] tracking-tight md:text-5xl">
          Clear your inbox
          <br />
          in a single pass.
        </h2>
        <p className="mt-6 max-w-md text-base leading-[1.6] text-white/60">
          Aura reads every message, understands intent, and routes the noise
          away from the signal. Focus on what moves your day forward — the rest
          handles itself.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          {["Auto-categorize", "Snooze for later", "Silent newsletters", "One-tap unsubscribe"].map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70"
            >
              {chip}
            </span>
          ))}
        </div>
      </motion.div>
      <div className="liquid-glass rounded-2xl p-5">
        <p className="mb-4 text-sm text-white/50">Today · 42 messages triaged</p>
        <div className="grid gap-3">
          {groups.map((group) => (
            <div key={group.title} className="liquid-glass rounded-lg p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  {group.title}
                </span>
                <span className="text-xs text-white/40">{group.count}</span>
              </div>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <p key={item} className="rounded-md bg-white/[0.03] px-3 py-2 text-xs text-white/55">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LogoCloud() {
  const names = ["Linear", "Vercel", "Figma", "Stripe", "Ramp", "Notion", "Loom", "Arc"];

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-16 md:py-20">
      <p className="text-center text-xs uppercase tracking-widest text-white/40">
        Trusted by the world&apos;s most thoughtful teams
      </p>
      <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4 lg:grid-cols-8">
        {names.map((name, index) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05, duration: 0.5 }}
            className="text-center text-sm font-semibold tracking-tight text-white/50 transition-colors hover:text-white"
          >
            {name}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Testimonials() {
  const testimonials = [
    {
      quote:
        "Aura gave our leadership team four hours of their week back. It reads like email from the future.",
      name: "Parker Wilf",
      role: "Group Product Manager",
      company: "MERCURY",
    },
    {
      quote:
        "The command palette alone has changed how I process messages. I can't imagine going back to a traditional client.",
      name: "Andrew von Rosenbach",
      role: "Senior Engineering Program Manager",
      company: "COHERE",
    },
    {
      quote:
        "Triage that actually understands context. Our team stopped dreading Monday morning inboxes.",
      name: "Mathies Christensen",
      role: "Engineering Manager",
      company: "LUNAR",
    },
  ];

  return (
    <section className="relative z-10 mx-auto grid max-w-6xl gap-4 border-t border-white/10 px-6 py-20 md:grid-cols-3 md:py-28">
      {testimonials.map((item) => (
        <figure key={item.name} className="liquid-glass rounded-2xl p-6">
          <blockquote className="text-sm leading-[1.6] text-white/80">
            &quot;{item.quote}&quot;
          </blockquote>
          <figcaption className="mt-6 border-t border-white/10 pt-5">
            <p className="text-sm font-semibold">{item.name}</p>
            <p className="mt-1 text-xs text-white/50">{item.role}</p>
            <p className="mt-3 text-xs font-semibold tracking-wide text-white">
              {item.company}
            </p>
          </figcaption>
        </figure>
      ))}
    </section>
  );
}

function PricingNoiseFilter() {
  return (
    <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
      <defs>
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
      </defs>
    </svg>
  );
}

const planFeatures = {
  Free: [
    "Up to 3 projects in the cloud",
    "Image export up to 1080p",
    "Basic editing tools",
    "Free templates and icons",
    "Access via web and mobile app.",
  ],
  Standard: [
    "Up to 50 projects in the cloud",
    "Export up to 4K",
    "Advanced editing toolkit",
    "Team collaboration (up to 5 members)",
    "Access to premium template library.",
  ],
  Pro: [
    "Unlimited projects",
    "Export up to 8K + animations",
    "AI-powered content generation tools",
    "Unlimited team members",
    "Brand customization.",
  ],
};

function Pricing() {
  const [yearly, setYearly] = useState(false);
  const plans = [
    {
      tier: "Free",
      price: "Free",
      desc: "For creators taking their first steps with Forma.",
      features: planFeatures.Free,
    },
    {
      tier: "Standard",
      price: yearly ? "$99,99/y" : "$9,99/m",
      desc: "For freelancers and small teams who need more freedom and flexibility.",
      features: planFeatures.Standard,
    },
    {
      tier: "Pro",
      price: yearly ? "$199,99/y" : "$19,99/m",
      desc: "For studios, agencies, and professional creators working with brands.",
      features: planFeatures.Pro,
      pro: true,
    },
  ];

  return (
    <section className="c3-pricing-section">
      <PricingNoiseFilter />
      <div className="c3-watermark-container">
        <div className="c3-watermark-main">
          <span className="c3-watermark-line-1">Your email.</span>
          <span className="c3-watermark-line-2">Revitalized</span>
        </div>
      </div>
      <div className="c3-grid">
        {plans.map((plan) => (
          <div
            key={plan.tier}
            className={`c3-card ${plan.pro ? "c3-card-pro" : ""}`}
          >
            <p className="c3-tier-small">{plan.tier}</p>
            <p className="c3-tier-large">{plan.price}</p>
            <p className="c3-desc">{plan.desc}</p>
            <ul className="c3-list">
              {plan.features.map((feature) => (
                <li key={feature}>
                  <span className="c3-check">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <button className="c3-btn" type="button">
              Choose Plan
            </button>
          </div>
        ))}
      </div>
      <div className="c3-toggle-wrap">
        <span className="text-sm text-white/60">Yearly</span>
        <button
          className={`c3-toggle ${yearly ? "active" : ""}`}
          onClick={() => setYearly((value) => !value)}
          type="button"
          aria-label="Toggle yearly pricing"
        >
          <span className="c3-toggle-knob" />
        </button>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-20 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="liquid-glass relative overflow-hidden rounded-3xl px-8 py-16 text-center md:py-24"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(600px circle at 50% 0%, rgba(255,255,255,0.15), transparent 70%)",
          }}
        />
        <div className="relative z-10">
          <h2 className="text-4xl font-semibold leading-[1.02] tracking-tight md:text-6xl">
            Close the tabs.
            <br />
            Open your day.
          </h2>
          <p className="mx-auto mt-6 max-w-md text-sm leading-[1.6] text-white/60">
            Join thousands of builders, founders, and operators who treat email
            like a tool — not an obligation.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <AppleButton label="Download Aura" />
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
              type="button"
            >
              Talk to sales
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#0c0c0c] text-white">
      <RootNoiseFilter />
      <div className="pointer-events-none fixed inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="pointer-events-none h-full w-full object-cover"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4"
        />
      </div>
      <div className="pointer-events-none fixed inset-0 z-[1] bg-[#0c0c0c]/55" />
      <div className="pointer-events-none fixed inset-y-0 left-1/2 z-[5] hidden w-px -translate-x-[calc(50%+36rem)] bg-white/10 md:block" />
      <div className="pointer-events-none fixed inset-y-0 left-1/2 z-[5] hidden w-px translate-x-[calc(-50%+36rem)] bg-white/10 md:block" />
      <Navbar />
      <Hero />
      <MenuBarStrip />
      <InboxMockup />
      <FeatureTriage />
      <LogoCloud />
      <Testimonials />
      <Pricing />
      <FinalCTA />
    </main>
  );
}
