"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import { LogOut, Sparkles, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

export type RoleSidebarGroup = {
  label: string;
  items: Array<{
    title: string;
    href: string;
    icon: LucideIcon;
    badge?: string;
  }>;
};

type RoleSidebarProps = {
  homeHref: string;
  srLabel: string;
  groups: RoleSidebarGroup[];
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RoleSidebar({ homeHref, srLabel, groups }: RoleSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const allItems = groups.flatMap((group) => group.items);
  const activeHref = allItems.find((item) => isActivePath(pathname, item.href))?.href ?? homeHref;
  const [pillHref, setPillHref] = useState("");
  const navRef = useRef<HTMLDivElement | null>(null);
  const activeCardRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const hasPlacedActiveCardRef = useRef(false);
  const pillHrefRef = useRef<string | null>(null);

  const updatePillTextTarget = useCallback((href: string | null) => {
    if (pillHrefRef.current === href) return;

    pillHrefRef.current = href;
    setPillHref(href ?? "");
  }, []);

  const animateTo = useCallback((href: string, immediate = false) => {
    const nav = navRef.current;
    const card = activeCardRef.current;
    const target = itemRefs.current.get(href);
    if (!nav || !card || !target) {
      updatePillTextTarget(null);
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldPlaceImmediately = immediate || prefersReducedMotion;
    const navRect = nav.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    gsap.killTweensOf(card);
    gsap.to(card, {
      x: targetRect.left - navRect.left,
      y: targetRect.top - navRect.top,
      width: targetRect.width,
      height: targetRect.height,
      opacity: 1,
      duration: shouldPlaceImmediately ? 0 : 0.82,
      ease: "power2.inOut",
      force3D: true,
      onUpdate: () => {
        const cardRect = card.getBoundingClientRect();
        let coveredHref: string | null = null;

        for (const [itemHref, itemNode] of itemRefs.current) {
          const itemRect = itemNode.getBoundingClientRect();
          const verticalOverlap = Math.max(0, Math.min(cardRect.bottom, itemRect.bottom) - Math.max(cardRect.top, itemRect.top));
          const horizontalOverlap = Math.max(0, Math.min(cardRect.right, itemRect.right) - Math.max(cardRect.left, itemRect.left));
          const verticalRatio = verticalOverlap / itemRect.height;
          const horizontalRatio = horizontalOverlap / itemRect.width;

          if (verticalRatio > 0.48 && horizontalRatio > 0.48) {
            coveredHref = itemHref;
            break;
          }
        }

        updatePillTextTarget(coveredHref);
      },
      onComplete: () => updatePillTextTarget(href),
    });
  }, [updatePillTextTarget]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      animateTo(activeHref, !hasPlacedActiveCardRef.current);
      hasPlacedActiveCardRef.current = true;
    });

    const handleResize = () => animateTo(activeHref, true);
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeHref, animateTo]);

  const handleSignOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <aside className="dashboard-glass-surface relative z-[2] hidden h-full w-[196px] shrink-0 rounded-[30px] text-neutral-950 md:flex md:flex-col">
      <div className="flex h-[70px] items-center px-5">
        <Link
          href={homeHref}
          className="flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 text-neutral-950 transition hover:bg-neutral-950/5"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-neutral-950">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-base font-semibold tracking-tight">WarpTalk</span>
            <span className="sr-only">{srLabel}</span>
          </div>
        </Link>
      </div>

      <nav ref={navRef} className="relative flex-1 overflow-hidden px-3 py-1">
        <div
          ref={activeCardRef}
          className="pointer-events-none absolute left-0 top-0 z-0 overflow-hidden rounded-[18px] bg-neutral-950 opacity-0 shadow-[0_12px_28px_rgba(0,0,0,0.2)] will-change-transform"
          aria-hidden="true"
        >
          <span className="absolute inset-px rounded-[17px] border border-white/10" />
        </div>

        <div className="relative z-10 space-y-2">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const routeActive = item.href === activeHref;
                  const visuallyActive = item.href === pillHref;
                  return (
                    <Link
                      key={item.href}
                      ref={(node) => {
                        if (node) itemRefs.current.set(item.href, node);
                        else itemRefs.current.delete(item.href);
                      }}
                      href={item.href}
                      aria-current={routeActive ? "page" : undefined}
                      className={cn(
                        "relative flex h-[32px] items-center gap-2 rounded-[18px] px-2.5 text-[13px] font-medium text-neutral-600 transition-colors duration-200 hover:bg-neutral-950/5 hover:text-neutral-950",
                        routeActive && "font-semibold",
                        visuallyActive && "text-white hover:text-white"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0 transition-all duration-200", routeActive && "h-[17px] w-[17px]")} />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.badge ? (
                        <span
                          className={cn(
                            "rounded-md bg-neutral-950/8 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 transition-colors duration-200",
                            visuallyActive && "bg-white/15 text-white"
                          )}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-neutral-950/8 p-3">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex h-8 w-full items-center gap-2 rounded-[18px] px-2.5 text-xs font-medium text-neutral-500 transition hover:bg-neutral-950/5 hover:text-neutral-950"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
