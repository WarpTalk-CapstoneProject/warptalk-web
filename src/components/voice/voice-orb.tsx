"use client";

/**
 * A voice's face: a lit sphere whose colours come from its id.
 *
 * Static CSS rather than the WebGL this app already ships (ogl, on one page). The library lists
 * several hundred voices at once, and a canvas per row would be several hundred GPU contexts for
 * a picture that does not move. A gradient is free to paint and identical on every render.
 */

import { orbBackground } from "@/lib/voice/voice-orb";
import { cn } from "@/lib/utils";

export function VoiceOrb({ voiceId, className }: { voiceId: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-7 shrink-0 rounded-full shadow-[inset_0_-2px_6px_rgba(0,0,0,0.18)]",
        className,
      )}
      style={{ background: orbBackground(voiceId) }}
    />
  );
}
