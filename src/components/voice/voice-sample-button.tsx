"use client";

import { useCallback } from "react";
import { Pause, Play, SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAudioPlayback } from "@/hooks/use-audio-playback";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { VoiceProfileService } from "@/services/voice-profile.service";

/**
 * Play the recording this person uploaded — the ORIGINAL, not the clone.
 *
 * WHY IT SITS BESIDE VoicePreviewButton RATHER THAN REPLACING IT
 *     They answer different questions, and the answer is only useful as a pair. "Your voices"
 *     plays what you recorded; "Stand-in voice" plays what the clone made of it. Somebody judging
 *     whether the system works is judging the DISTANCE between the two, and the page previously
 *     offered no way to hear the first one at all — so the clone had nothing to be compared
 *     against and "is this good?" had no answer.
 *
 * WHY THE FAILURES READ DIFFERENTLY
 *     A preview can fail because a provider is busy. This cannot: the file is either stored or it
 *     is not. A library pick has no recording behind it, and a clone whose audio has been reduced
 *     to an embedding no longer has one either — both are ordinary states rather than errors, so
 *     they are said plainly.
 */
export function VoiceSampleButton({
  profileId,
  label,
  className,
  variant = "icon",
}: {
  profileId: string;
  /** Whose recording it is, for the screen-reader label. */
  label?: string;
  className?: string;
  variant?: "icon" | "inline";
}) {
  const fetchAudio = useCallback(() => VoiceProfileService.sample(profileId), [profileId]);
  const { state, toggle } = useAudioPlayback(fetchAudio);

  async function play() {
    const error = await toggle();
    if (error) toast.error(await sampleErrorMessage(error));
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
          ? `Stop the recording of ${label ?? "this voice"}`
          : `Hear the original recording of ${label ?? "this voice"}`
      }
    >
      {glyph}
      {variant === "inline" ? (state === "playing" ? "Stop" : "Hear the original") : null}
    </Button>
  );
}

export const SAMPLE_FALLBACK_MESSAGE = "Could not play your recording.";

/**
 * The same Blob-unwrapping problem VoicePreviewButton has: `responseType: "blob"` applies to
 * FAILURE responses too, so a JSON error body arrives as a Blob and reads as "[object Blob]"
 * unless it is read back as text first.
 */
async function sampleErrorMessage(error: unknown): Promise<string> {
  const body: unknown = (error as { response?: { data?: unknown } })?.response?.data;

  if (body instanceof Blob) {
    try {
      const parsed: unknown = JSON.parse(await body.text());
      const { error: message, code } = (parsed ?? {}) as { error?: unknown; code?: unknown };
      return messageFor(typeof code === "string" ? code : undefined, message);
    } catch {
      // Not JSON, or unreadable.
    }
    return SAMPLE_FALLBACK_MESSAGE;
  }

  return messageFor(apiErrorCode(error), getErrorMessage(error, SAMPLE_FALLBACK_MESSAGE));
}

function messageFor(code: string | number | undefined, serverMessage: unknown): string {
  // NOT_FOUND is what somebody else's profile answers, and also what a profile that has been
  // deleted answers. Neither is worth distinguishing to the person looking at their own list.
  if (code === "NOT_FOUND") return "That voice profile is no longer available.";
  if (code === "INVALID_STATE") return "There is no recording stored for this voice.";

  const fromServer = typeof serverMessage === "string" ? serverMessage.trim() : "";
  return fromServer.length > 0 ? fromServer : SAMPLE_FALLBACK_MESSAGE;
}
