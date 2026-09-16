"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AudioPlaybackState = "idle" | "loading" | "playing";

/**
 * Play one clip, fetched on demand, without leaking it.
 *
 * WHY THIS IS A HOOK AND NOT COPIED INTO EACH BUTTON
 *     An object URL is a live handle into the document, not a value: leaving one behind on every
 *     press keeps the whole blob alive for the lifetime of the page. There are now two buttons
 *     that play audio for a voice profile — the CLONE speaking, and the ORIGINAL recording — and
 *     the second one existing is exactly when that lifecycle would have been copied and then
 *     diverged.
 *
 *     The two differ in what they fetch and in how they explain a failure. They do not differ in
 *     any of this, so this is the part they share.
 */
export function useAudioPlayback(fetchAudio: () => Promise<Blob>) {
  const [state, setState] = useState<AudioPlaybackState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Revoked on unmount and before each replacement below.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  /** Plays, or stops if already playing. Returns the error to report, or null on success. */
  const toggle = useCallback(async (): Promise<unknown | null> => {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("idle");
      return null;
    }

    setState("loading");
    try {
      const blob = await fetchAudio();

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("idle");
      await audio.play();
      setState("playing");
      return null;
    } catch (error) {
      setState("idle");
      // Handed back rather than reported here: what a failure MEANS differs between the clone and
      // the original, and this hook has no business deciding either sentence.
      return error;
    }
  }, [fetchAudio, state]);

  return { state, toggle };
}
