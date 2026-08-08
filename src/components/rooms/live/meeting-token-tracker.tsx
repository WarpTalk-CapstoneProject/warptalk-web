"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { Coins } from "@phosphor-icons/react/dist/ssr";
import { useEffect } from "react";

export function MeetingTokenTracker({ tokensUsed }: { tokensUsed: number }) {
  const springValue = useSpring(tokensUsed, {
    stiffness: 50,
    damping: 15,
  });

  useEffect(() => {
    springValue.set(tokensUsed);
  }, [tokensUsed, springValue]);

  // Format with commas, e.g. 10,500
  const displayValue = useTransform(springValue, (current) =>
    Math.round(current).toLocaleString("en-US")
  );

  if (tokensUsed === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-surface-1/90 px-4 py-2 text-sm font-medium text-ink shadow-lg backdrop-blur border border-surface-3"
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-white">
        <Coins weight="fill" className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-[10px] uppercase tracking-wider text-text-subtle font-semibold">Credits Used</span>
        <motion.span className="font-mono text-base font-bold tabular-nums">
          {displayValue}
        </motion.span>
      </div>
    </motion.div>
  );
}
