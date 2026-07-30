"use client";
import React from "react";
import Link from "next/link";
import { HalftoneBackground } from "./HalftoneBackground";
import { GlassOverlay } from "./GlassOverlay";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative w-full min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden bg-white text-black">

      {/* Layer 1 — white bg */}

      {/* Layer 2 — Halftone Background */}
      <HalftoneBackground src="/image-a.png" />

      {/* Layer 3 — Glass Overlay */}
      <GlassOverlay src="/image-b.png" />

      {/* Layer 4 — Text Content & CTA */}
      <div className="relative z-20 flex flex-col items-center text-center px-6 max-w-3xl mx-auto w-full -mt-[8vh]">
        <h1 className="text-[3rem] leading-[1.05] md:text-[4.2rem] lg:text-[5rem] font-semibold tracking-tighter mb-5 text-black">
          Translation that feels{" "}
          <span className="italic font-light text-neutral-700">native.</span>
        </h1>
        <p className="text-base md:text-lg text-neutral-500 max-w-md mx-auto mb-8 font-medium leading-relaxed">
          Real-time interpretation for global teams. Natural conversations. Zero language barriers.
        </p>
        <Link href="/register">
          <Button className="rounded-full px-10 py-5 text-base shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.16)] hover:-translate-y-0.5 transition-all duration-300 bg-black text-white hover:bg-neutral-900 font-medium tracking-wide">
            Start translating now
          </Button>
        </Link>
      </div>

    </section>
  );
}



