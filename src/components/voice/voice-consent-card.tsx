"use client";

/**
 * Where a person allows, or withdraws, a MEETING building a voice model from their live speech.
 *
 * WHY THIS IS NOT THE SAME CONSENT AS THE ONE IN THE CREATE DIALOG
 *     There are two permissions in this product and they were both called "voice cloning", which
 *     is why the page read as asking twice. They are separate rows with separate types in
 *     `voice_consents` and they gate different machinery:
 *
 *       VOICE_PROFILE_UPLOAD — the five confirmations in the create-profile dialog. Recorded
 *           against a recording somebody uploads, checked by VoiceProfileService.CreateProfileAsync,
 *           and sufficient on its own: the sample is cloned and usable without anything here.
 *
 *       VOICE_CLONE — this one. Read by UserServiceGrpc.HasVoiceCloneConsent, which
 *           translation-room asks before a room may clone a speaker from the first seconds of
 *           what they say, and by VoiceCarryOverService before such a voice is kept for the next
 *           meeting. Nothing about an uploaded profile depends on it.
 *
 *     So the copy below names the mechanism rather than the feature. "Voice cloning" on its own
 *     is true of both and distinguishes neither.
 *
 * WHY IT IS ITS OWN CONTROL AND NOT A TOGGLE IN A MEETING
 *     There is already a per-meeting switch ("use my cloned voice here"). This is not that. A
 *     cloned voice is biometric data, and permission to build one has to be given knowingly,
 *     once, somewhere the person can find it again to take it back — not buried in a control bar
 *     during a call they are trying to pay attention to. AuthService records each decision with
 *     the wording that was shown and the time it was made.
 */

import { CheckCircle, SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { VoiceChip } from "@/components/voice/voice-line";
import { WorkspaceRailModule } from "@/components/workspace/page-chrome";
import {
  useGrantVoiceConsent,
  useRevokeVoiceConsent,
  useVoiceConsent,
} from "@/hooks/use-voice-profiles";

export function VoiceConsentCard() {
  const { data, isLoading } = useVoiceConsent();
  const grant = useGrantVoiceConsent();
  const revoke = useRevokeVoiceConsent();

  const pending = grant.isPending || revoke.isPending;
  const granted = data?.isGranted === true;

  return (
    <WorkspaceRailModule
      title="Cloning you in a meeting"
      badge={
        isLoading ? null : granted ? (
          <VoiceChip tone="ready">
            <CheckCircle size={11} weight="fill" />
            Allowed
          </VoiceChip>
        ) : null
      }
      description={
        granted
          ? "A meeting may build a voice model from the first seconds of your speech and dub you in it. That model is biometric data, is used only to dub what you say, and stops being used the moment you withdraw this."
          : "Off. A meeting will not build a voice from your live speech — your translated words are read in a library voice instead. Uploading a voice below is a separate permission and works without this."
      }
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2 text-[12px] text-ink-muted">
          <SpinnerGap className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </span>
      ) : granted ? (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11.5px] text-ink-subtle">
            {data?.grantedAt ? new Date(data.grantedAt).toLocaleDateString() : "Granted"}
            {data?.consentTextVersion ? ` · terms ${data.consentTextVersion}` : ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-[12px] text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() =>
              revoke.mutate(undefined, {
                onSuccess: () => toast.success("Withdrawn. Meetings will not clone your voice."),
                onError: () => toast.error("Could not withdraw your consent. Try again."),
              })
            }
          >
            Withdraw
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          className="h-8 w-full text-[12.5px]"
          disabled={pending}
          onClick={() =>
            grant.mutate(undefined, {
              onSuccess: () => toast.success("Meetings may now clone your voice."),
              onError: () => toast.error("Could not record your consent. Try again."),
            })
          }
        >
          Allow it
        </Button>
      )}
    </WorkspaceRailModule>
  );
}
