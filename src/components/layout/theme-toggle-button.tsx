"use client";

import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "next-themes";
import { flushSync } from "react-dom";

export function ThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  function switchTheme() {
    setTheme(nextTheme);
  }

  function handleToggle() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      switchTheme();
      return;
    }

    const documentWithTransition = document as Document & {
      startViewTransition?: (callback: () => void) => ViewTransition;
    };

    if (!documentWithTransition.startViewTransition) {
      switchTheme();
      return;
    }

    documentWithTransition.startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
      });
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="relative flex size-6 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <Sun
        size={12}
        weight="bold"
        className={`absolute transition-all duration-200 ${isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
      />
      <Moon
        size={12}
        weight="bold"
        className={`absolute transition-all duration-200 ${isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`}
      />
    </button>
  );
}
