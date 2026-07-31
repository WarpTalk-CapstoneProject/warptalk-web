"use client";

import { flushSync } from "react-dom";
import { useEffect, useMemo } from "react";
import { MoonStars, SunDim } from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const STYLE_ID = "warptalk-theme-toggle-style";
const BASE_STYLE_ID = "warptalk-theme-toggle-base-style";
const DEFAULT_DURATION = 900;
const DEFAULT_EASING =
  "linear(0 0%, 0.2342 12.49%, 0.4374 24.99%, 0.6093 37.49%, 0.6835 43.74%, 0.7499 49.99%, 0.8086 56.25%, 0.8593 62.5%, 0.9023 68.75%, 0.9375 75%, 0.9648 81.25%, 0.9844 87.5%, 0.9961 93.75%, 1 100%)";

function createPolygonGradientMask() {
  const gradient = [
    '<linearGradient id="g" x1="0" y1="0" x2="20.5" y2="20.5" gradientUnits="userSpaceOnUse">',
    '<stop stop-color="white"/>',
    '<stop offset="0.84506" stop-color="white" stop-opacity="0.99"/>',
    '<stop offset="0.9506" stop-color="white" stop-opacity="0"/>',
    '<stop offset="1" stop-color="white" stop-opacity="0"/>',
    "</linearGradient>",
  ].join("");

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">',
    `<defs>${gradient}</defs>`,
    '<path d="M0 0H40L0 40V0Z" fill="url(#g)"/>',
    "</svg>",
  ].join("");

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function ensureBaseStyles() {
  if (typeof document === "undefined" || document.getElementById(BASE_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = BASE_STYLE_ID;
  style.textContent = `
    ::view-transition-group(root) {
      isolation: isolate;
    }

    ::view-transition-old(root) {
      animation: none;
    }
  `;
  document.head.appendChild(style);
}

function injectPolygonGradientStyles(duration: number) {
  if (typeof document === "undefined") return null;

  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();

  const mask = createPolygonGradientMask();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ::view-transition-group(root) {
      animation-duration: ${duration}ms;
      animation-timing-function: ${DEFAULT_EASING};
    }

    ::view-transition-new(root) {
      mask: ${mask} top left / 0 no-repeat;
      -webkit-mask: ${mask} top left / 0 no-repeat;
      animation: warptalkPolygonGradientScale ${duration}ms ${DEFAULT_EASING} both;
      will-change: mask-size, -webkit-mask-size;
    }

    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: none;
      z-index: -1;
    }

    @keyframes warptalkPolygonGradientScale {
      to {
        mask-size: 200vmax;
        -webkit-mask-size: 200vmax;
      }
    }
  `;

  document.head.appendChild(style);
  return style;
}

export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    ensureBaseStyles();
  }, []);

  const currentTheme = useMemo(() => {
    return (resolvedTheme ?? theme ?? "light") === "dark" ? "dark" : "light";
  }, [resolvedTheme, theme]);

  const toggleTheme = () => {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    if (
      typeof document === "undefined" ||
      !document.startViewTransition ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setTheme(nextTheme);
      return;
    }

    const style = injectPolygonGradientStyles(DEFAULT_DURATION);
    const transition = document.startViewTransition(() => {
      flushSync(() => setTheme(nextTheme));
    });

    transition.finished.finally(() => {
      style?.remove();
    });
  };

  return (
    <button
      type="button"
      aria-label={currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={currentTheme === "dark"}
      title={currentTheme === "dark" ? "Light mode" : "Dark mode"}
      data-state={currentTheme}
      onClick={toggleTheme}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full border border-hairline bg-surface-1 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      <span className="sr-only">
        {currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      </span>
      {currentTheme === "dark" ? (
        <SunDim weight="light" className="size-3" />
      ) : (
        <MoonStars weight="light" className="size-3" />
      )}
    </button>
  );
}
