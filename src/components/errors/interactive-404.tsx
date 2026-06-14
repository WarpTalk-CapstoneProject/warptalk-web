"use client";

import Link from "next/link";
import { useEffect, useRef, type PointerEvent } from "react";
import gsap from "gsap";
import { ArrowUpRight, ArrowCounterClockwise, Sparkle } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FloatingCard = {
  element: HTMLDivElement;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
};

type Interactive404Props = {
  mode?: "not-found" | "error";
  onRetry?: () => void;
};

const cards = [
  { className: "left-[7%] top-[13%] rotate-[-12deg]", tone: "bg-white/[0.08]" },
  { className: "right-[7%] top-[14%] rotate-[10deg]", tone: "bg-black/20" },
  { className: "left-[4%] top-[44%] rotate-[13deg]", tone: "bg-black/20" },
  { className: "right-[-2%] top-[41%] rotate-[-18deg]", tone: "bg-white/[0.08]" },
  { className: "left-[17%] bottom-[6%] rotate-[13deg]", tone: "bg-white/[0.1]" },
  { className: "right-[10%] bottom-[10%] rotate-[12deg]", tone: "bg-black/20" },
  { className: "left-[47%] bottom-[5%] rotate-[-13deg]", tone: "bg-white/[0.09]" },
];

export function Interactive404({ mode = "not-found", onRetry }: Interactive404Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<HTMLDivElement[]>([]);
  const cardsRef = useRef<FloatingCard[]>([]);
  const pointerRef = useRef({
    active: false,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    lastTime: 0,
    grabbed: null as FloatingCard | null,
    grabOffsetX: 0,
    grabOffsetY: 0,
  });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const setupCards = () => {
      const frameRect = frame.getBoundingClientRect();
      cardsRef.current = itemRefs.current.filter(Boolean).map((element, index) => {
        const rect = element.getBoundingClientRect();
        const x = rect.left - frameRect.left;
        const y = rect.top - frameRect.top;
        const card = {
          element,
          x,
          y,
          width: rect.width,
          height: rect.height,
          vx: (index % 2 === 0 ? 18 : -16) * 0.02,
          vy: 0,
          angle: gsap.getProperty(element, "rotation") as number,
          spin: (index % 2 === 0 ? -1 : 1) * 0.02,
        };

        gsap.set(element, { x: 0, y: 0, transformOrigin: "50% 50%", willChange: "transform" });
        return card;
      });
    };

    setupCards();

    const settle = gsap.fromTo(
      itemRefs.current,
      { y: -120, opacity: 0, rotationX: -18 },
      {
        y: 0,
        opacity: 1,
        rotationX: 0,
        stagger: 0.07,
        duration: 1.05,
        ease: "bounce.out",
        onComplete: setupCards,
      }
    );

    const tick = () => {
      const frameRect = frame.getBoundingClientRect();
      const pointer = pointerRef.current;
      const maxX = frameRect.width;
      const maxY = frameRect.height;

      cardsRef.current.forEach((card) => {
        const grabbed = pointer.grabbed === card;

        if (grabbed) {
          card.x += (pointer.x - pointer.grabOffsetX - card.x) * 0.34;
          card.y += (pointer.y - pointer.grabOffsetY - card.y) * 0.34;
          card.vx = pointer.vx * 0.48;
          card.vy = pointer.vy * 0.48;
          card.spin += pointer.vx * 0.00035;
        } else {
          card.vy += 0.23;
          card.x += card.vx;
          card.y += card.vy;
          card.vx *= 0.992;
          card.vy *= 0.992;
          card.spin *= 0.988;

          if (pointer.active) {
            const centerX = card.x + card.width / 2;
            const centerY = card.y + card.height / 2;
            const dx = centerX - pointer.x;
            const dy = centerY - pointer.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const hitRadius = Math.max(82, Math.min(150, Math.hypot(pointer.vx, pointer.vy) * 0.28));

            if (distance < hitRadius) {
              const force = (hitRadius - distance) / hitRadius;
              card.vx += (dx / distance) * force * 12 + pointer.vx * 0.18;
              card.vy += (dy / distance) * force * 12 + pointer.vy * 0.18;
              card.spin += (pointer.vx - pointer.vy) * force * 0.002;
            }
          }
        }

        if (card.x < 0) {
          card.x = 0;
          card.vx = Math.abs(card.vx) * 0.72;
          card.spin += 0.05;
        }
        if (card.x + card.width > maxX) {
          card.x = maxX - card.width;
          card.vx = -Math.abs(card.vx) * 0.72;
          card.spin -= 0.05;
        }
        if (card.y < 0) {
          card.y = 0;
          card.vy = Math.abs(card.vy) * 0.58;
        }
        if (card.y + card.height > maxY) {
          card.y = maxY - card.height;
          card.vy = -Math.abs(card.vy) * 0.58;
          card.vx *= 0.9;
          card.spin *= 0.82;
        }

        card.angle += card.spin;
        gsap.set(card.element, {
          x: card.x - (card.element.offsetLeft || 0),
          y: card.y - (card.element.offsetTop || 0),
          rotation: card.angle,
        });
      });
    };

    gsap.ticker.add(tick);
    window.addEventListener("resize", setupCards);

    return () => {
      settle.kill();
      gsap.ticker.remove(tick);
      window.removeEventListener("resize", setupCards);
    };
  }, []);

  const updatePointer = (event: PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    const now = event.timeStamp;
    const pointer = pointerRef.current;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dt = Math.max(16, now - (pointer.lastTime || now));

    pointer.active = true;
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = x;
    pointer.y = y;
    pointer.vx = ((x - pointer.px) / dt) * 16.67;
    pointer.vy = ((y - pointer.py) / dt) * 16.67;
    pointer.lastTime = now;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>, index: number) => {
    updatePointer(event);
    const card = cardsRef.current[index];
    if (!card) return;

    const pointer = pointerRef.current;
    pointer.grabbed = card;
    pointer.grabOffsetX = pointer.x - card.x;
    pointer.grabOffsetY = pointer.y - card.y;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer.grabbed) {
      pointer.grabbed.vx += pointer.vx * 0.85;
      pointer.grabbed.vy += pointer.vy * 0.85;
      pointer.grabbed.spin += (pointer.vx - pointer.vy) * 0.0012;
    }
    pointer.grabbed = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const copy =
    mode === "error"
      ? {
          eyebrow: "Something broke",
          title: "OH NO!",
          description: "The page hit an error. You can retry or return to a stable route.",
          primary: "Go Back Home",
        }
      : {
          eyebrow: "Page not found",
          title: "OH NO!",
          description: "Sorry, page not found",
          primary: "Go Back Home",
        };

  return (
    <main className="min-h-screen bg-black p-4 text-white sm:p-6">
      <section
        ref={frameRef}
        onPointerMove={updatePointer}
        onPointerLeave={() => {
          pointerRef.current.active = false;
          pointerRef.current.grabbed = null;
        }}
        className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[28px] border border-white/18 bg-[#080808] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),0_26px_90px_rgba(0,0,0,0.55)] sm:min-h-[calc(100vh-3rem)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.06),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.03),transparent_45%)]" />

        <header className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10">
            <Sparkle weight="light" className="h-4 w-4" />
            <span className="sr-only">WarpTalk home</span>
          </Link>
          <nav className="hidden items-center gap-5 text-[11px] text-white/65 md:flex">
            <Link href="/rooms" className="transition hover:text-white">Rooms</Link>
            <Link href="/history" className="transition hover:text-white">History</Link>
            <Link href="/login" className="rounded-full bg-white px-4 py-2 font-medium text-black transition hover:bg-white/90">
              Contact us <ArrowUpRight weight="light" className="ml-1 inline h-3 w-3" />
            </Link>
          </nav>
        </header>

        {cards.map((card, index) => (
          <div
            key={index}
            ref={(node) => {
              if (node) itemRefs.current[index] = node;
            }}
            onPointerDown={(event) => handlePointerDown(event, index)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={cn(
              "absolute z-10 flex h-[76px] w-[142px] cursor-grab select-none items-center justify-center rounded-2xl border border-white/10 text-4xl font-semibold tracking-[0.08em] text-white/88 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-md active:cursor-grabbing sm:h-[88px] sm:w-[168px] sm:text-5xl",
              card.tone,
              card.className
            )}
          >
            404
          </div>
        ))}

        <div className="relative z-20 m-auto flex max-w-3xl flex-col items-center px-6 text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.34em] text-white/45">{copy.eyebrow}</p>
          <h1 className="text-[clamp(4.8rem,13vw,11rem)] font-semibold leading-none tracking-[-0.08em] text-white">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-md text-sm text-white/72 sm:text-base">{copy.description}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/rooms"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#6c76ff] px-6 text-sm font-medium text-white shadow-[0_16px_36px_rgba(108,118,255,0.28)] transition hover:bg-[#7b84ff]"
            >
              {copy.primary} <ArrowUpRight weight="light" className="ml-2 h-4 w-4" />
            </Link>
            {onRetry ? (
              <Button
                type="button"
                variant="outline"
                onClick={onRetry}
                className="h-11 rounded-full border-white/15 bg-white/5 px-5 text-white hover:bg-white/10 hover:text-white"
              >
                <ArrowCounterClockwise weight="light" className="mr-2 h-4 w-4" />
                Try again
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
