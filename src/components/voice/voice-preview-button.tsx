"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/api/errors";
import { VoiceProfileService } from "@/services/voice-profile.service";

/**
 * Hear a voice before a meeting instead of during one.
 *
 * WHY THIS EXISTS
 *     Until now there was no way to hear ANY voice outside a meeting — not a library voice, and
 *     not the one cloned from your own uploaded recording. The only way to find out how you
 *     sounded to other people was to be in a call with them, which is the worst possible moment
 *     to discover the answer.
 *
 * WHY THE FIRST PLAY IS SLOW AND THE REST ARE NOT
 *     The first press renders on the AI side (the only place with the provider key). That render
 *     is cached by (voice, language), so every press after it — by anyone — is a cache read. The
 *     spinner is therefore a first-time cost, not the normal one, and the button says so by
 *     showing it rather than disabling itself silently.
 */
export function VoicePreviewButton({
  voiceId,
  language,
  label,
  className,
  variant = "icon",
}: {
  voiceId: string;
  language: string;
  /** What is being previewed, for the screen-reader label. */
  label?: string;
  className?: string;
  /**
   * "icon" in a list, where the row already says which voice it is and a repeated word would
   * be noise. "inline" where the button stands alone and has to name its own action.
   */
  variant?: "icon" | "inline";
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // An object URL is a live handle into the document, not a value — leaving one behind on every
  // preview leaks the whole blob for the life of the page. Revoked on unmount and before each
  // replacement below.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  async function play() {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("idle");
      return;
    }

    setState("loading");
    try {
      const blob = await VoiceProfileService.preview({ voiceId, language });

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => {
        setState("idle");
        toast.error("The preview could not be played.");
      };
      await audio.play();
      setState("playing");
    } catch (error) {
      setState("idle");
      toast.error(await previewErrorMessage(error));
    }
  }

  const busy = state === "loading";
  const glyph = busy ? (
    <SpinnerGap weight="bold" className="h-3.5 w-3.5 animate-spin" />
  ) : state === "playing" ? (
    <Pause weight="fill" className="h-3.5 w-3.5" />
  ) : (
    <Play weight="fill" className="h-3.5 w-3.5" />
  );

  return (
    <Button
      type="button"
      variant="ghost"
      size={variant === "icon" ? "icon" : "sm"}
      className={
        className ??
        (variant === "icon"
          ? "h-7 w-7 text-ink-muted hover:text-ink"
          : "h-7 gap-1.5 px-2 text-[12px] text-ink-muted hover:text-ink")
      }
      onClick={play}
      disabled={busy}
      aria-label={
        state === "playing"
          ? `Stop the preview of ${label ?? "this voice"}`
          : `Hear ${label ?? "this voice"}`
      }
    >
      {glyph}
      {variant === "inline" ? (state === "playing" ? "Stop" : "Hear it") : null}
    </Button>
  );
}

/**
 * The reason this is not just `getErrorMessage`.
 *
 * The request asks for `responseType: "blob"`, and axios honours that for FAILURE responses too
 * — so the server's `{ error, errorCode }` body arrives as a Blob and every message extractor
 * reads it as "[object Blob]". The body has to be read back as text before it says anything.
 *
 * That matters here more than in most places: the named failures this endpoint returns ("the
 * preview is taking longer than expected", "that voice is not one you can preview") are the
 * whole difference between a button that explains itself and one that just does not work.
 */
async function previewErrorMessage(error: unknown): Promise<string> {
  const fallback = "Could not play a preview of this voice.";
  const body: unknown = (error as { response?: { data?: unknown } })?.response?.data;

  if (body instanceof Blob) {
    try {
      const parsed: unknown = JSON.parse(await body.text());
      const message = (parsed as { error?: unknown })?.error;
      if (typeof message === "string" && message.trim()) {
        return message;
      }
    } catch {
      // Not JSON, or unreadable. Fall through to the generic message rather than showing raw
      // bytes to somebody who pressed play.
    }
    return fallback;
  }

  return getErrorMessage(error, fallback);
}
