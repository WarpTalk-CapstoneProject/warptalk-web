"use client";

import { MoonStars, SunDim } from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const currentTheme = (resolvedTheme ?? theme ?? "light") === "dark" ? "dark" : "light";

  const toggleTheme = () => {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
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
