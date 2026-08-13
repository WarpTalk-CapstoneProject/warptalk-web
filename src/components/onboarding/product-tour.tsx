"use client";

/**
 * The guided walk through the app: a dimmed screen, one control lit at a time, and a card that
 * says what it is for.
 *
 * It runs on its own the first time somebody signs in, and on demand from the ? button in the
 * header — the same tour either way, because a first-run experience nobody can replay is a
 * feature you get exactly one chance to read.
 *
 * THE SPOTLIGHT IS ONE ELEMENT, NOT FOUR
 *   The obvious way to dim everything except a rectangle is four overlay panels around it, and
 *   the seams between them show on any non-integer device pixel ratio — which is every laptop
 *   with a scaled display. A single box with an enormous spread shadow cuts one hole with no
 *   seams to misalign.
 *
 * IT MEASURES ON EVERY FRAME IT MATTERS AND NOT MORE
 *   The lit element moves for reasons the tour does not control: a sidebar animating open, a
 *   window resize, a scroll. Re-measuring on those three events keeps the hole on the control
 *   rather than beside it, and re-measuring on a timer would burn a layout pass per tick for a
 *   thing that is usually still.
 *
 * A MISSING TARGET IS NOT AN ERROR
 *   Steps are filtered against the real DOM before the tour starts (`visibleSteps`), so a
 *   Member never walks to a highlight of the Billing link they do not have. If a target
 *   disappears mid-tour anyway — a responsive breakpoint, a nav that re-renders — the step
 *   falls back to a centred card rather than lighting the top-left corner of the screen.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { ArrowLeft, ArrowRight, X } from "@phosphor-icons/react/dist/ssr";

import {
  TOUR_STEPS,
  TOUR_TARGET_ATTRIBUTE,
  visibleSteps,
  type TourStep,
} from "@/lib/onboarding/tour-steps";
import { cn } from "@/lib/utils";
import { useOnboardingStore } from "@/stores/onboarding-store";

/** Breathing room between the lit control and the edge of the hole. */
const SPOTLIGHT_PADDING = 6;

/** Gap between the hole and the card. */
const CARD_GAP = 12;

const CARD_WIDTH = 320;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measure(target: string | null): Rect | null {
  if (!target || typeof document === "undefined") return null;
  const element = document.querySelector(
    `[${TOUR_TARGET_ATTRIBUTE}="${target}"]`,
  );
  if (!element) return null;

  const box = element.getBoundingClientRect();
  // A target that is present but collapsed to nothing — a sidebar mid-animation, a control
  // hidden by a breakpoint rather than unmounted — is not something to point at.
  if (box.width < 1 || box.height < 1) return null;

  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/**
 * Mounts the tour when it opens, and unmounts it when it closes.
 *
 * The split is what lets the runner below read the DOM in a `useState` initialiser: it only
 * ever exists while the tour is open, so "which steps apply" is answered once, on mount,
 * against a shell that is already on screen — rather than in an effect that would have to
 * re-answer it and renumber the steps under somebody mid-tour.
 */
export function ProductTour() {
  const tourOpen = useOnboardingStore((state) => state.tourOpen);
  if (!tourOpen) return null;
  return <TourRunner />;
}

/**
 * The rectangle to light up, kept in step with a target that moves for reasons the tour does
 * not control — a sidebar animating open, a window resize, a scroll inside <main>.
 */
function useTargetRect(target: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(() => measure(target));

  useLayoutEffect(() => {
    const update = () => setRect(measure(target));
    // Measuring the DOM is the "synchronize with an external system" case: the position of
    // another component's element cannot be computed during render. A LAYOUT effect rather than
    // an effect so the hole is painted over the control on the first frame, instead of
    // appearing in the top-left corner and jumping to it.
    update();

    window.addEventListener("resize", update);
    // Capture phase: the app scrolls inside <main>, not on the window, so a listener on the
    // window alone never fires for the scroll that actually moves the target.
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [target]);

  return rect;
}

function TourRunner() {
  const closeTour = useOnboardingStore((state) => state.closeTour);

  // Resolved once, on mount. A Member never walks to a highlight of the Billing link they do
  // not have, and the count in "3/9" cannot change under them halfway through.
  const [steps] = useState(() =>
    visibleSteps(TOUR_STEPS, (target) => measure(target) !== null),
  );
  const [index, setIndex] = useState(0);

  const step = steps[index] ?? null;
  const rect = useTargetRect(step?.target ?? null);

  const finish = useCallback(() => closeTour(Date.now()), [closeTour]);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current >= steps.length - 1) {
        finish();
        return current;
      }
      return current + 1;
    });
  }, [steps.length, finish]);

  const back = useCallback(
    () => setIndex((current) => Math.max(0, current - 1)),
    [],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, next, back]);

  const cardPosition = useMemo(
    () => positionCard(rect, step?.placement),
    [rect, step?.placement],
  );

  if (!step) return null;

  const isLast = index === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {rect ? (
        <>
          {/* The hole. `pointer-events-none` on the shadow itself so the click that dismisses
              lands on the backdrop below rather than on a 9999px shadow that covers the world. */}
          <div
            className="pointer-events-none absolute rounded-lg ring-2 ring-[var(--primary)] transition-all duration-200"
            style={{
              top: rect.top - SPOTLIGHT_PADDING,
              left: rect.left - SPOTLIGHT_PADDING,
              width: rect.width + SPOTLIGHT_PADDING * 2,
              height: rect.height + SPOTLIGHT_PADDING * 2,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
            }}
          />
          <button
            type="button"
            aria-label="Close the tour"
            onClick={finish}
            className="absolute inset-0 cursor-default"
            tabIndex={-1}
          />
        </>
      ) : (
        <button
          type="button"
          aria-label="Close the tour"
          onClick={finish}
          className="absolute inset-0 cursor-default bg-black/55"
          tabIndex={-1}
        />
      )}

      <div
        className={cn(
          "absolute w-[320px] rounded-[14px] border border-border bg-surface-1 p-4 shadow-lg",
          !rect && "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
        style={rect ? cardPosition : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[14px] font-semibold text-ink">{step.title}</p>
          <button
            type="button"
            onClick={finish}
            aria-label="Skip the tour"
            className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" aria-hidden>
            {steps.map((dot, dotIndex) => (
              <span
                key={dot.id}
                className={cn(
                  "h-1 rounded-full transition-all",
                  dotIndex === index
                    ? "w-4 bg-[var(--primary)]"
                    : "w-1 bg-surface-4",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-[11px] tabular-nums text-ink-subtle">
              {index + 1}/{steps.length}
            </span>
            {index > 0 ? (
              <button
                type="button"
                onClick={back}
                className="grid size-7 place-items-center rounded-lg border border-border/60 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="Previous step"
              >
                <ArrowLeft size={12} weight="bold" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={next}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-foreground px-2.5 text-[12px] font-medium text-background transition hover:opacity-90"
            >
              {isLast ? "Done" : "Next"}
              {isLast ? null : <ArrowRight size={12} weight="bold" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Where the card goes, given the hole and a preferred side.
 *
 * Clamped to the viewport on both axes, because the preferred side is a preference: the
 * WarpBot launcher sits in the bottom-right corner and the help button is at the very top, and
 * an unclamped card for either would be half off the screen.
 */
function positionCard(
  rect: Rect | null,
  placement: TourStep["placement"] = "right",
): { top: number; left: number } | undefined {
  if (!rect || typeof window === "undefined") return undefined;

  const margin = 12;
  // The card's height is unknown before it lays out; this is the tallest a step realistically
  // gets, and it is only used to keep the card on screen.
  const assumedHeight = 210;

  let top: number;
  let left: number;

  switch (placement) {
    case "bottom":
      top = rect.top + rect.height + CARD_GAP;
      left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
      break;
    case "top":
      top = rect.top - assumedHeight - CARD_GAP;
      left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
      break;
    case "left":
      top = rect.top;
      left = rect.left - CARD_WIDTH - CARD_GAP;
      break;
    default:
      top = rect.top;
      left = rect.left + rect.width + CARD_GAP;
  }

  return {
    top: Math.min(
      Math.max(margin, top),
      window.innerHeight - assumedHeight - margin,
    ),
    left: Math.min(
      Math.max(margin, left),
      window.innerWidth - CARD_WIDTH - margin,
    ),
  };
}
