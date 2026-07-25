import React from "react";
import { WaveSine, UserFocus } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

/**
 * Pre-join quick toggles for the Krisp noise filter and camera background blur —
 * styled to match the mic/camera buttons in the same overlay (see join/page.tsx and
 * setup-room-modal.tsx). The actual LiveKit processors are only applied once inside
 * the room (see src/hooks/use-track-processors.ts); here we just collect the choice.
 */
export function AvEffectsToggle({
  noiseSuppressionEnabled,
  onToggleNoiseSuppression,
  backgroundBlurEnabled,
  onToggleBackgroundBlur,
}: {
  noiseSuppressionEnabled: boolean;
  onToggleNoiseSuppression: () => void;
  backgroundBlurEnabled: boolean;
  onToggleBackgroundBlur: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggleNoiseSuppression}
        title={noiseSuppressionEnabled ? "Turn off noise suppression" : "Turn on noise suppression"}
        className={cn(
          "w-10 h-10 rounded-[8px] flex items-center justify-center transition-colors text-[14px]",
          noiseSuppressionEnabled ? "bg-primary/10 text-primary hover:bg-primary/15" : "bg-surface-2 text-ink hover:bg-surface-3"
        )}
      >
        <WaveSine className="w-4 h-4" weight={noiseSuppressionEnabled ? "fill" : "regular"} />
      </button>
      <button
        type="button"
        onClick={onToggleBackgroundBlur}
        title={backgroundBlurEnabled ? "Turn off background blur" : "Turn on background blur"}
        className={cn(
          "w-10 h-10 rounded-[8px] flex items-center justify-center transition-colors text-[14px]",
          backgroundBlurEnabled ? "bg-primary/10 text-primary hover:bg-primary/15" : "bg-surface-2 text-ink hover:bg-surface-3"
        )}
      >
        <UserFocus className="w-4 h-4" weight={backgroundBlurEnabled ? "fill" : "regular"} />
      </button>
    </>
  );
}
