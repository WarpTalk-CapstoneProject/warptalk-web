"use client";
import React, { useRef, useState, useCallback, useEffect } from "react";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlassOverlayProps {
  src: string;
  className?: string;
}

interface Bubble {
  id: number;
  /** Position relative to the interaction zone (0–100 %) */
  x: number;
  y: number;
  /** Diameter in px */
  size: number;
  /** CSS animation duration in ms */
  duration: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum SVG displacement strength on hover (px). Keep ≤ 14 for subtlety. */
const MAX_DISPLACEMENT = 12;

/**
 * Lerp factor applied each RAF frame (0–1).
 * 0.08 = ~8% of the remaining gap is closed per frame → silky-smooth ramp.
 */
const LERP_FACTOR = 0.08;

/** Milliseconds between bubble spawns while the cursor is inside. */
const BUBBLE_INTERVAL_MS = 300;

/** Hard cap on simultaneous live bubbles to keep the DOM lean. */
const MAX_BUBBLES = 8;

// Monotonically-increasing key for React list reconciliation.
let _bubbleId = 0;

// ─── Component ────────────────────────────────────────────────────────────────

export function GlassOverlay({ src, className = "" }: GlassOverlayProps) {
  /**
   * FULL-SCREEN COVERAGE STRATEGY
   * ──────────────────────────────
   * The outer shell already uses `absolute inset-0` (matching the HeroSection
   * which is `relative min-h-[100dvh]`).  We make the interaction zone also
   * fill that same inset-0 box so the image covers every pixel of the hero.
   *
   * The Next.js <Image fill> prop + `object-cover` then stretches the image
   * to fill its container while preserving the original aspect ratio — the
   * browser crops the excess rather than distorting the image.
   *
   * Hover deformation & bubbles continue to work unchanged because cursor
   * positions are computed as a fraction of the wrapper's bounding rect,
   * and bubble coordinates are stored as %-based values relative to the
   * same wrapper — so they scale gracefully to any viewport size.
   */

  // ── DOM refs ──────────────────────────────────────────────────────────────

  /** The full-screen interaction zone we measure for cursor %. */
  const wrapperRef = useRef<HTMLDivElement>(null);

  /**
   * Direct ref to <feDisplacementMap> so we can mutate `scale` imperatively
   * inside the RAF loop — avoids triggering a React re-render every frame.
   */
  const dispMapRef = useRef<SVGFEDisplacementMapElement | null>(null);

  /**
   * Direct ref to <feTurbulence> so we can shift `baseFrequency` imperatively
   * on every mouse-move to anchor the ripple at the cursor position.
   */
  const turbRef = useRef<SVGFETurbulenceElement | null>(null);

  // ── Hover / cursor state ──────────────────────────────────────────────────

  /** Normalised cursor position (0–1) used to drive the depression overlay. */
  const [cursor, setCursor] = useState<{ nx: number; ny: number } | null>(null);

  /**
   * feTurbulence seed — varied occasionally on mouse-move for an organic,
   * non-repeating ripple texture.  This is the only state that triggers a
   * React re-render on mouse-move, and only ~12% of the time.
   */
  const [seed, setSeed] = useState(1);

  // ── Displacement animation ────────────────────────────────────────────────

  const dispRef = useRef(0);        // current interpolated scale value
  const targetDispRef = useRef(0);  // target: MAX_DISPLACEMENT or 0
  const rafRef = useRef<number | null>(null);

  /**
   * RAF loop: lerps dispRef.current → targetDispRef.current each frame,
   * writing directly to the SVG attribute so React stays out of the hot path.
   */
  const animateDisplacement = useCallback(() => {
    dispRef.current += (targetDispRef.current - dispRef.current) * LERP_FACTOR;
    const rounded = parseFloat(dispRef.current.toFixed(3));

    dispMapRef.current?.setAttribute("scale", String(rounded));

    const delta = Math.abs(dispRef.current - targetDispRef.current);
    if (delta > 0.03) {
      rafRef.current = requestAnimationFrame(animateDisplacement);
    } else {
      // Snap to exact target and stop the loop
      dispRef.current = targetDispRef.current;
      dispMapRef.current?.setAttribute("scale", String(targetDispRef.current));
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(animateDisplacement);
    }
  }, [animateDisplacement]);

  // ── Bubble state ──────────────────────────────────────────────────────────

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const bubbleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Always-current cursor position stored imperatively so the bubble-spawn
   * interval can read it without stale-closure issues.
   */
  const latestCursorRef = useRef<{ nx: number; ny: number } | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Mouse event handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Normalise to 0–1 inside the full-screen wrapper
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;

      setCursor({ nx, ny });
      latestCursorRef.current = { nx, ny };

      /**
       * RIPPLE ANCHORING TRICK
       * ───────────────────────
       * We shift feTurbulence.baseFrequency proportionally to the cursor
       * position.  This makes the fractal noise pattern appear to originate
       * *under the cursor* rather than at the fixed top-left corner of the
       * image, giving the convincing illusion that the user is pressing the
       * water surface at exactly that point.
       */
      if (turbRef.current) {
        const fx = (0.012 + nx * 0.007).toFixed(5);
        const fy = (0.012 + ny * 0.007).toFixed(5);
        turbRef.current.setAttribute("baseFrequency", `${fx} ${fy}`);
      }

      // Vary the noise seed ~12% of the time for organic, non-repeating feel
      if (Math.random() < 0.12) {
        setSeed(Math.floor(Math.random() * 80) + 1);
      }

      // Ramp displacement toward maximum
      targetDispRef.current = MAX_DISPLACEMENT;
      startLoop();
    },
    [startLoop]
  );

  const handleMouseEnter = useCallback(() => {
    // Spawn a new bubble at the latest cursor position on a fixed cadence
    bubbleTimerRef.current = setInterval(() => {
      const pos = latestCursorRef.current;
      if (!pos) return;

      setBubbles((prev) => [
        ...prev.slice(-(MAX_BUBBLES - 1)), // evict oldest when at cap
        {
          id: ++_bubbleId,
          // Small random jitter keeps bubbles from stacking perfectly
          x: pos.nx * 100 + (Math.random() - 0.5) * 7,
          y: pos.ny * 100 + (Math.random() - 0.5) * 7,
          size: 3 + Math.random() * 9,
          duration: 850 + Math.random() * 700,
        },
      ]);
    }, BUBBLE_INTERVAL_MS);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setCursor(null);
    latestCursorRef.current = null;

    // Smoothly ramp displacement back to zero (RAF loop handles lerp)
    targetDispRef.current = 0;
    startLoop();

    if (bubbleTimerRef.current) {
      clearInterval(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }
    // Let in-flight bubble animations finish before purging DOM nodes
    setTimeout(() => setBubbles([]), 1400);
  }, [startLoop]);

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup on unmount
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (bubbleTimerRef.current) clearInterval(bubbleTimerRef.current);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    /**
     * OUTER SHELL
     * ────────────
     * `absolute inset-0`  → fills the full HeroSection (which is `relative`).
     * `z-10`              → sits above HalftoneBackground (z-0) but below the
     *                       text layer (z-20).
     * `mix-blend-multiply`→ blends with the halftone dots beneath.
     * `pointer-events-none` → ensures the hero CTA button (z-20) is clickable;
     *                       pointer events are re-enabled only on the inner
     *                       interaction zone.
     */
    <div
      className={`absolute inset-0 z-10 mix-blend-multiply pointer-events-none ${className}`}
    >
      {/**
       * FULL-SCREEN INTERACTION ZONE
       * ─────────────────────────────
       * Also `absolute inset-0` so it covers the same pixel area as the outer
       * shell.  `pointer-events-auto` re-enables mouse tracking on this element
       * only, leaving everything outside (i.e. the text layer above) unaffected.
       *
       * `isolation: isolate` creates a new stacking context so the SVG filter
       * applied to the child image div doesn't accidentally bleed onto sibling
       * layers.
       */}
      <div
        ref={wrapperRef}
        className="absolute inset-0 pointer-events-auto"
        style={{ isolation: "isolate" }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/**
         * SVG FILTER DEFINITION
         * ──────────────────────
         * Rendered as a 0×0 off-screen element; it only provides the filter
         * primitive, not any visual output itself.
         *
         * x/y/width/height are set generously (-20%/+140%) so the displaced
         * pixels never get clipped at the edges of the filter region — this
         * is especially important now that the image is full-screen.
         *
         * feTurbulence  → fractal noise field; baseFrequency is mutated
         *                 imperatively by handleMouseMove to anchor the ripple.
         * feDisplacementMap → offsets pixels along the noise field; `scale`
         *                 is lerped 0→MAX_DISPLACEMENT by the RAF loop.
         */}
        <svg
          width="0"
          height="0"
          aria-hidden
          style={{ position: "absolute", overflow: "hidden" }}
        >
          <defs>
            <filter
              id="glass-water-ripple"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                ref={turbRef}
                type="turbulence"
                baseFrequency="0.015 0.015"
                numOctaves={4}
                seed={seed}
                result="noise"
              />
              {/**
               * `scale` starts at 0 → the filter is a visual no-op by default.
               * The RAF loop smoothly lerps it to MAX_DISPLACEMENT on hover.
               * Keeping the value ≤ 14px ensures the deformation looks like a
               * gentle water-surface indent rather than a glitch.
               */}
              <feDisplacementMap
                ref={dispMapRef}
                in="SourceGraphic"
                in2="noise"
                scale={0}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>

        {/**
         * IMAGE CONTAINER
         * ────────────────
         * `absolute inset-0` + Next.js `fill` prop makes the image fill this
         * box edge-to-edge.  `object-cover` preserves the image's aspect ratio
         * and crops the excess — no distortion, no letterboxing, no white edges.
         *
         * The SVG filter is wired up permanently (`url(#glass-water-ripple)`).
         * With `scale=0` it is a no-op; the RAF loop animates scale on hover.
         * We never disconnect the filter between hover sessions so the lerp
         * fade-out can complete without a hard snap.
         */}
        <div
          className="absolute inset-0"
          style={{ filter: "url(#glass-water-ripple)" }}
        >
          <Image
            src={src}
            alt="Glass water surface"
            fill
            className="object-cover opacity-[0.9]"
            style={{ filter: "brightness(1.06) contrast(1.1)" }}
            sizes="100vw"
            quality={100}
            priority
          />
        </div>

        {/**
         * DEPRESSION SHADOW OVERLAY
         * ──────────────────────────
         * A soft dark radial gradient centred at the cursor coordinate (given
         * as a % of the wrapper, i.e. the full viewport).  It simulates the
         * shadow ring that appears around a real water-surface indentation.
         * The gradient covers ~13% × 9% of the viewport at the cursor point.
         */}
        {cursor && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(
                ellipse 13% 9% at ${cursor.nx * 100}% ${cursor.ny * 100}%,
                rgba(0, 50, 110, 0.14) 0%,
                rgba(0, 70, 150, 0.07) 45%,
                transparent 100%
              )`,
              transition: "background 0.04s linear",
            }}
          />
        )}

        {/**
         * BUBBLE KEYFRAMES
         * ─────────────────
         * Defined inline so they don't pollute the global stylesheet.
         * Bubbles rise ~36px and fade to transparent over their duration.
         */}
        <style>{`
          @keyframes glass-bubble-rise {
            0%   { transform: translateY(0px)    scale(1);    opacity: 0.6;  }
            60%  { transform: translateY(-22px)  scale(0.95); opacity: 0.38; }
            100% { transform: translateY(-36px)  scale(0.75); opacity: 0;    }
          }
        `}</style>

        {/**
         * BUBBLE ELEMENTS
         * ────────────────
         * Tiny circles spawned at the cursor position that float upward and
         * fade out, mimicking air bubbles released by pressing a water surface.
         *
         * Coordinates are %-based relative to the wrapper (= full viewport),
         * so they position correctly at every screen size without any maths
         * change — this is a direct benefit of switching to full-screen layout.
         */}
        {bubbles.map((b) => (
          <span
            key={b.id}
            aria-hidden
            style={{
              position: "absolute",
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: b.size,
              height: b.size,
              borderRadius: "50%",
              // Glass-like bubble: bright highlight at top-left, pale-blue edge
              background:
                "radial-gradient(circle at 33% 28%, rgba(255,255,255,0.72), rgba(190,220,255,0.22) 55%, transparent)",
              border: "1px solid rgba(170, 215, 255, 0.42)",
              boxShadow: "0 0 5px rgba(80, 170, 255, 0.18)",
              pointerEvents: "none",
              animation: `glass-bubble-rise ${b.duration}ms ease-out forwards`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
