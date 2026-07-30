"use client";
import React from "react";
import Image from "next/image";

interface HalftoneBackgroundProps { src: string; className?: string; }
export function HalftoneBackground({ src, className = "" }: HalftoneBackgroundProps) {
  return (
    <div className={`absolute inset-0 z-0 flex items-center justify-center pointer-events-none mix-blend-multiply overflow-hidden ${className}`}>
      {/* 
        110–130vw: expands slightly past viewport so left/right wave models
        reach close to the edges without overwhelming the composition.
      */}
      <div className="w-[110vw] sm:w-[115vw] lg:w-[120vw] xl:w-[130vw] max-w-[2400px] flex items-center justify-center flex-shrink-0">
        <Image
          src={src}
          alt="Halftone Background"
          width={1800}
          height={1000}
          className="w-full h-auto object-contain opacity-[0.35]"
          style={{ filter: "brightness(1.04) contrast(1.1)" }}
          sizes="130vw"
          quality={100}
          priority
        />
      </div>
    </div>
  );
}




