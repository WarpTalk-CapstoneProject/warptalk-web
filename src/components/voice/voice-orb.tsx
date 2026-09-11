"use client";

/**
 * A voice's face: a grainy, softly lit sphere whose colours and form come from its id.
 *
 * The orb is drawn by one shared WebGL context (lib/voice/voice-orb-renderer) and shown here as a
 * background image — never a canvas per row, which a list of several hundred voices would turn
 * into several hundred GPU contexts. Until its picture arrives, and on a machine without WebGL,
 * the row shows a CSS gradient in the same palette.
 *
 * It asks to be drawn only once it is near the viewport. The library scrolls inside a bounded box,
 * so of four hundred rows perhaps ten are ever looked at; the rest never cost a draw.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { orbFallbackBackground } from "@/lib/voice/voice-orb";
import {
  peekOrbPicture,
  requestOrbPicture,
  subscribeOrbPicture,
} from "@/lib/voice/voice-orb-renderer";
import { cn } from "@/lib/utils";

export function VoiceOrb({
  voiceId,
  size = 28,
  className,
}: {
  voiceId: string;
  /** CSS pixels. The picture is drawn at this times the device pixel ratio. */
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [nearViewport, setNearViewport] = useState(false);

  const picture = useSyncExternalStore(
    useCallback((notify: () => void) => subscribeOrbPicture(voiceId, size, notify), [voiceId, size]),
    () => peekOrbPicture(voiceId, size),
    () => undefined,
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || picture) return;
    return requestOrbPicture(voiceId, size);
  }, [nearViewport, picture, voiceId, size]);

  return (
    <span
      ref={ref}
      aria-hidden
      className={cn("inline-block shrink-0 overflow-hidden rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: picture
          ? `center / cover no-repeat url("${picture}")`
          : orbFallbackBackground(voiceId),
      }}
    />
  );
}
