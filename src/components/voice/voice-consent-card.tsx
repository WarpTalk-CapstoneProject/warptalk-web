"use client";

/**
 * Where a person grants or withdraws permission for their voice to be cloned.
 *
 * WHY IT IS ITS OWN THING AND NOT A TOGGLE IN A MEETING
 *     There is already a per-meeting switch ("use my cloned voice here"). This is not that. A
 *     cloned voice is biometric data, and permission to build one has to be given knowingly,
 *     once, somewhere the person can find it again to take it back — not buried in a control bar
 *     during a call they are trying to pay attention to. AuthService records each decision with
 *     the wording that was shown and the time it was made, and translation-room asks it before
 *     any meeting may switch cloning on.
 *
 * WHY THE COPY IS BLUNT
 *     Consent obtained from text nobody reads is not consent anybody can defend. It says what is
 *     collected, what it is used for, how long it lives, and that it can be withdrawn — in the
 *     fewest words that still say it.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Microphone, Spinner } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { VoiceConsentService } from "@/services/voice-profile.service";

const VOICE_CONSENT_KEY = ["voice-consent"] as const;

export function VoiceConsentCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: VOICE_CONSENT_KEY,
    queryFn: () => VoiceConsentService.status(),
  });

  const grant = useMutation({
    mutationFn: () => VoiceConsentService.grant(),
    onSuccess: (status) => {
      queryClient.setQueryData(VOICE_CONSENT_KEY, status);
      toast.success("Voice cloning enabled for your account.");
    },
    onError: () => toast.error("Could not record your consent. Try again."),
  });

  const revoke = useMutation({
    mutationFn: () => VoiceConsentService.revoke(),
    onSuccess: (status) => {
      queryClient.setQueryData(VOICE_CONSENT_KEY, status);
      toast.success("Voice cloning consent withdrawn.");
    },
    onError: () => toast.error("Could not withdraw your consent. Try again."),
  });

  const pending = grant.isPending || revoke.isPending;
  const granted = data?.isGranted === true;

  return (
    <section className="mx-4 rounded-[14px] border border-border bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-border bg-surface-1 text-primary">
          <Microphone size={18} weight="duotone" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-semibold text-ink">Voice cloning</h2>
            {granted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                <CheckCircle size={12} weight="fill" />
                Allowed
              </span>
            ) : null}
          </div>

          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-muted">
            To speak in your own voice in another language, WarpTalk builds a voice model from a
            short sample of your speech during a meeting. That model is biometric data. It is used
            only to dub what you say, is never shared with other workspaces, and stops being used
            the moment you withdraw this permission.
          </p>

          {granted && data?.grantedAt ? (
            <p className="mt-1.5 text-[11px] text-ink-subtle">
              Granted {new Date(data.grantedAt).toLocaleDateString()} · terms{" "}
              {data.consentTextVersion}
            </p>
          ) : null}

          <div className="mt-3">
            {isLoading ? (
              <span className="inline-flex items-center gap-2 text-[12px] text-ink-muted">
                <Spinner className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </span>
            ) : granted ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => revoke.mutate()}
              >
                Withdraw consent
              </Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => grant.mutate()}>
                Allow voice cloning
              </Button>
            )}
          </div>

          {!granted && !isLoading ? (
            // Says what is lost, not just what is off. Without cloning the product still
            // translates and still speaks — in a library voice — and someone deciding is
            // entitled to know that refusing does not break their meetings.
            <p className="mt-2 text-[11px] text-ink-subtle">
              Without this, your translated speech is read in one of WarpTalk&rsquo;s library
              voices instead of your own. Everything else works the same.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
