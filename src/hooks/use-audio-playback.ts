"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { claimPlayback, type PlaybackClaim } from "@/lib/audio/exclusive-playback";

export type AudioPlaybackState = "idle" | "loading" | "playing";

/**
 * Play one clip, fetched on demand, without leaking it — and without playing over another.
 *
 * WHY THIS IS A HOOK AND NOT COPIED INTO EACH BUTTON
 *     An object URL is a live handle into the document, not a value: leaving one behind on every
 *     press keeps the whole blob alive for the lifetime of the page. There are two buttons that
 *     play audio for a voice — the CLONE speaking, and the ORIGINAL recording — and the second
 *     one existing is exactly when that lifecycle would have been copied and then diverged.
 *
 *     The same is true of "only one at a time". Each button used to own its own Audio element and
 *     nothing else could stop it, so pressing play down a list stacked every clip on top of the
 *     last. Every press now takes the page's single slot (see lib/audio/exclusive-playback), which
 *     stops whatever else was playing or still loading.
 *
 *     The two buttons differ in what they fetch and in how they explain a failure. They do not
 *     differ in any of this, so this is the part they share.
 */
export function useAudioPlayback(
  fetchAudio: () => Promise<Blob>,
  /** A clip that started and then failed mid-stream — `toggle` cannot return that one. */
  onPlaybackError?: () => void,
) {
  const [state, setState] = useState<AudioPlaybackState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const claimRef = useRef<PlaybackClaim | null>(null);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  useEffect(() => {
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackError]);

  // Revoked on unmount and before each replacement below. The slot is handed back too, or the
  // next press anywhere on the page would try to stop a button that no longer exists.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      claimRef.current?.release();
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
      claimRef.current?.release();
      setState("idle");
      return null;
    }

    // Taken on the press, before the fetch: a clip still loading when another row is pressed must
    // be superseded now, not start playing over it when its response lands.
    const claim = claimPlayback(() => {
      audioRef.current?.pause();
      setState("idle");
    });
    claimRef.current = claim;

    setState("loading");
    try {
      const blob = await fetchAudio();
      // Someone else pressed play while this was loading. Their stop already set us idle.
      if (!claim.isCurrent()) return null;

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        claim.release();
        setState("idle");
      };
      audio.onerror = () => {
        claim.release();
        setState("idle");
        onPlaybackErrorRef.current?.();
      };
      await audio.play();
      if (!claim.isCurrent()) {
        audio.pause();
        return null;
      }
      setState("playing");
      return null;
    } catch (error) {
      // Superseded while failing: the new clip owns the page now, and a toast about the old one
      // would describe something the person has already moved on from.
      if (!claim.isCurrent()) return null;
      claim.release();
      setState("idle");
      // Handed back rather than reported here: what a failure MEANS differs between the clone and
      // the original, and this hook has no business deciding either sentence.
      return error;
    }
  }, [fetchAudio, state]);

  return { state, toggle };
}
