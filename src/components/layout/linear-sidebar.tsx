"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SquaresFour,
  ClockCounterClockwise,
  Sparkle,
  BookBookmark,
  Waveform,
  GearSix,
  MagnifyingGlass,
  PencilSimpleLine,
  CaretDown,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: Icon;
  label: string;
  href: string;
}

const mainNav: NavItem[] = [
  { icon: SquaresFour, label: "Meetings", href: "/rooms" },
  { icon: ClockCounterClockwise, label: "History", href: "/history" },
  { icon: Sparkle, label: "AI Summaries", href: "/ai-summaries" },
];

const configNav: NavItem[] = [
  { icon: BookBookmark, label: "Terminology", href: "/terminology" },
  { icon: Waveform, label: "Voice Profiles", href: "/voice-profiles" },
  { icon: GearSix, label: "Settings", href: "/settings" },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2.5 h-[30px] px-2 rounded-[6px] text-[13px] transition-colors",
        isActive
          ? "bg-surface-2"
          : "hover:bg-surface-2"
      )}
    >
      <item.icon size={16} className="shrink-0 text-ink-muted/80 group-hover:text-ink/80 transition-colors" weight="duotone" />
      <span className="font-medium tracking-tight text-ink/90 group-hover:text-ink transition-colors">{item.label}</span>
    </Link>
  );
}

export function LinearSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-[224px] bg-canvas text-ink h-full shrink-0 select-none">
      {/* Workspace */}
      <div className="flex items-center justify-between px-3 h-[48px] shrink-0">
        <div className="flex items-center gap-2 hover:bg-surface-2 px-1.5 py-1 -ml-1.5 rounded-md cursor-pointer transition-colors min-w-0">
          <div className="w-[20px] h-[20px] rounded bg-pink-400 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white leading-none tracking-tight">FP</span>
          </div>
          <span className="text-[14px] font-semibold text-ink truncate tracking-tight">FPT-SEP490-SU26</span>
          <CaretDown size={12} className="text-ink-muted ml-1 shrink-0" weight="bold" />
        </div>
        <div className="flex items-center gap-1.5 text-ink-muted shrink-0">
          <button className="flex size-7 items-center justify-center rounded-[6px] hover:bg-surface-2 hover:text-ink transition-colors">
            <MagnifyingGlass size={16} weight="regular" />
          </button>
          <button className="flex size-7 items-center justify-center rounded-[6px] hover:bg-surface-2 hover:text-ink transition-colors">
            <PencilSimpleLine size={16} weight="regular" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3">
        <div className="flex flex-col gap-[2px]">
          {mainNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        <div className="mt-6 mb-1 px-2 flex items-center h-[24px]">
          <span className="text-[12px] font-medium text-ink-subtle">Workspace</span>
        </div>
        <div className="flex flex-col gap-px">
          {configNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>
    </aside>
  );
}
