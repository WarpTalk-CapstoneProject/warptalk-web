"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const LOADER_MIN_VISIBLE_MS = 240;
const LOADER_FAILSAFE_MS = 8000;
const GSAP_COMPLETE_SCALE = 1;
const GSAP_HOLD_SCALE = 0.88;

function isPlainLeftClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function shouldShowForLink(anchor: HTMLAnchorElement) {
  if (!anchor.href || anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target.toLowerCase() !== "_self") return false;

  const nextUrl = new URL(anchor.href, window.location.href);
  const currentUrl = new URL(window.location.href);

  if (nextUrl.origin !== currentUrl.origin) return false;

  const sameRoute =
    nextUrl.pathname === currentUrl.pathname &&
    nextUrl.search === currentUrl.search;

  return !sameRoute;
}

export function PageTransitionLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(
    () => `${pathname}?${searchParams.toString()}`,
    [pathname, searchParams],
  );
  const [isLoading, setIsLoading] = useState(false);
  const startedAtRef = useRef(0);
  const hideTimerRef = useRef<number | null>(null);
  const failsafeTimerRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<{ kill: () => void } | null>(null);

  useEffect(() => {
    const clearTimer = (timer: typeof hideTimerRef) => {
      if (!timer.current) return;
      window.clearTimeout(timer.current);
      timer.current = null;
    };

    const hide = () => {
      clearTimer(hideTimerRef);
      clearTimer(failsafeTimerRef);
      const elapsed = Date.now() - startedAtRef.current;
      const delay = Math.max(0, LOADER_MIN_VISIBLE_MS - elapsed);
      hideTimerRef.current = window.setTimeout(() => {
        setIsLoading(false);
        hideTimerRef.current = null;
      }, delay);
    };

    hide();

    return () => {
      clearTimer(hideTimerRef);
    };
  }, [routeKey]);

  useEffect(() => {
    const show = () => {
      startedAtRef.current = Date.now();
      setIsLoading(true);
      if (failsafeTimerRef.current) {
        window.clearTimeout(failsafeTimerRef.current);
      }
      failsafeTimerRef.current = window.setTimeout(() => {
        setIsLoading(false);
        failsafeTimerRef.current = null;
      }, LOADER_FAILSAFE_MS);
    };

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !isPlainLeftClick(event)) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      if (!anchor || !shouldShowForLink(anchor)) return;

      show();
    };

    const handlePopState = () => show();

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      if (failsafeTimerRef.current) {
        window.clearTimeout(failsafeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const bar = barRef.current;
    if (!wrapper || !bar) return;
    if (!isLoading && startedAtRef.current === 0) return;

    let cancelled = false;

    import("gsap").then(({ gsap }) => {
      if (cancelled) return;

      animationRef.current?.kill();
      gsap.killTweensOf([wrapper, bar]);

      if (isLoading) {
        gsap.set(wrapper, { autoAlpha: 1 });
        gsap.set(bar, {
          scaleX: 0,
          transformOrigin: "left center",
        });

        animationRef.current = gsap
          .timeline()
          .to(bar, {
            scaleX: 0.72,
            duration: 0.42,
            ease: "power2.out",
          })
          .to(bar, {
            scaleX: GSAP_HOLD_SCALE,
            duration: 5,
            ease: "power1.out",
          });
        return;
      }

      animationRef.current = gsap
        .timeline({
          onComplete: () => {
            gsap.set(bar, { scaleX: 0 });
          },
        })
        .to(bar, {
          scaleX: GSAP_COMPLETE_SCALE,
          duration: 0.22,
          ease: "power2.out",
        })
        .to(
          wrapper,
          {
            autoAlpha: 0,
            duration: 0.16,
            ease: "power1.out",
          },
          "-=0.06",
        );
    });

    return () => {
      cancelled = true;
    };
  }, [isLoading]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden={!isLoading}
      role={isLoading ? "status" : undefined}
      className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647] h-[3px] overflow-hidden opacity-0"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left scale-x-0 bg-foreground"
      />
      <span className="sr-only">Loading page</span>
    </div>
  );
}
