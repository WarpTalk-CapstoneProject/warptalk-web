"use client";

import { animate } from "motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type AnimSnap = Record<string, string | number>;

type Props = {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  rootMargin?: string;
  animationFrom?: AnimSnap;
  animationTo?: AnimSnap[];
  easing?: string | number[] | ((t: number) => number);
  onAnimationComplete?: () => void;
  stepDuration?: number;
};

function buildKeyframes(from: AnimSnap, steps: AnimSnap[]): Record<string, Array<string | number>> {
  const keys = new Set<string>([
    ...Object.keys(from),
    ...steps.flatMap((step) => Object.keys(step)),
  ]);
  const out: Record<string, Array<string | number>> = {};

  keys.forEach((key) => {
    out[key] = [from[key], ...steps.map((step) => step[key])];
  });

  return out;
}

function applyInitialStyles(el: HTMLElement, snap: AnimSnap) {
  const styles: Record<string, string> = {};

  for (const [key, value] of Object.entries(snap)) {
    if (key === "y") {
      styles.transform = `translateY(${typeof value === "number" ? `${value}px` : value})`;
      continue;
    }

    if (key === "x") {
      styles.transform = `${styles.transform ?? ""} translateX(${typeof value === "number" ? `${value}px` : value})`.trim();
      continue;
    }

    if (key === "filter") {
      styles.filter = String(value);
      continue;
    }

    if (key === "opacity") {
      styles.opacity = String(value);
      continue;
    }

    (el.style as unknown as Record<string, string>)[key] = String(value);
  }

  if (styles.transform) el.style.transform = styles.transform;
  if (styles.filter !== undefined) el.style.filter = styles.filter;
  if (styles.opacity !== undefined) el.style.opacity = styles.opacity;
}

export function BlurText({
  text = "",
  delay = 200,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  animationFrom,
  animationTo,
  easing = (t: number) => t,
  onAnimationComplete,
  stepDuration = 0.35,
}: Props) {
  const elements = useMemo(
    () => (animateBy === "words" ? text.split(" ") : text.split("")),
    [animateBy, text],
  );
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLParagraphElement | null>(null);
  const spanRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  const defaultFrom = useMemo<AnimSnap>(
    () =>
      direction === "top"
        ? { filter: "blur(10px)", opacity: 0, y: -50 }
        : { filter: "blur(10px)", opacity: 0, y: 50 },
    [direction],
  );

  const defaultTo = useMemo<AnimSnap[]>(
    () => [
      { filter: "blur(5px)", opacity: 0.5, y: direction === "top" ? 5 : -5 },
      { filter: "blur(0px)", opacity: 1, y: 0 },
    ],
    [direction],
  );

  const fromSnapshot = animationFrom ?? defaultFrom;
  const toSnapshots = animationTo ?? defaultTo;

  useEffect(() => {
    spanRefs.current.forEach((span) => {
      if (span) applyInitialStyles(span, fromSnapshot);
    });
  }, [fromSnapshot, text, animateBy]);

  useEffect(() => {
    if (!inView) return;

    const stepCount = toSnapshots.length + 1;
    const totalDuration = stepDuration * (stepCount - 1);
    const times = Array.from({ length: stepCount }, (_, index) =>
      stepCount === 1 ? 0 : index / (stepCount - 1),
    );
    const keyframes = buildKeyframes(fromSnapshot, toSnapshots);
    const animations: Array<{ stop: () => void }> = [];

    spanRefs.current.forEach((span, index) => {
      if (!span) return;

      const targetKeyframes: Record<string, Array<string | number>> = {};
      for (const [key, frames] of Object.entries(keyframes)) {
        if (key === "y") {
          targetKeyframes.transform = frames.map((value) =>
            `translateY(${typeof value === "number" ? `${value}px` : value})`,
          );
        } else {
          targetKeyframes[key] = frames;
        }
      }

      const controls = animate(span, targetKeyframes as never, {
        duration: totalDuration,
        times,
        delay: (index * delay) / 1000,
        ease: easing as never,
      });

      if (index === elements.length - 1 && onAnimationComplete) {
        const finished = (controls as unknown as { finished?: Promise<unknown> }).finished;
        if (finished && typeof finished.then === "function") {
          finished.then(() => onAnimationComplete()).catch(() => undefined);
        }
      }

      animations.push({
        stop: () => {
          const controller = controls as unknown as {
            stop?: () => void;
            cancel?: () => void;
          };
          controller.stop?.();
          controller.cancel?.();
        },
      });
    });

    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [
    delay,
    easing,
    elements.length,
    fromSnapshot,
    inView,
    onAnimationComplete,
    stepDuration,
    toSnapshots,
  ]);

  return (
    <p ref={containerRef} className={cn("blur-text flex flex-wrap", className)}>
      {elements.map((segment, index) => (
        <span
          key={`${segment}-${index}`}
          ref={(el) => {
            spanRefs.current[index] = el;
          }}
          style={{
            display: "inline-block",
            willChange: "transform, filter, opacity",
          }}
        >
          {segment === " " ? "\u00A0" : segment}
          {animateBy === "words" && index < elements.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </p>
  );
}
