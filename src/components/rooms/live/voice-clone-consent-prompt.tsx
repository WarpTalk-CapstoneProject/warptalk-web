"use client";

/**
 * A small, dismissible card asking a speaker who is being dubbed in a library voice whether they
 * want their own. See lib/meeting/voice-clone-prompt.ts for when it appears.
 *
 * It still asks KNOWINGLY. Building a voice from live speech is biometric processing, so the card
 * carries the same wording the Voice settings card records consent against (descriptionGranted),
 * and accepting grants the account-level consent through the same endpoint. It does not widen
 * anything: "Not now" changes nothing, and the per-meeting switch and the withdraw button keep
 * working exactly as before.
 */

import { Microphone, X } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type Props = {
  pending: boolean;
  onAllow: () => void;
  onDismiss: () => void;
};

export function VoiceCloneConsentPrompt({ pending, onAllow, onDismiss }: Props) {
  const t = useTranslations("voiceProfiles.consent");

  return (
    <div
      role="dialog"
      aria-labelledby="voice-clone-prompt-title"
      className="fixed bottom-24 right-4 z-50 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-border bg-surface-1 p-4 text-ink shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Microphone size={16} weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="voice-clone-prompt-title" className="text-[13.5px] font-semibold leading-snug">
            {t("prompt.title")}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-muted">{t("prompt.body")}</p>
          <p className="mt-2 text-[11px] leading-snug text-ink-subtle">{t("descriptionGranted")}</p>
        </div>
        <button
          type="button"
          aria-label={t("prompt.later")}
          className="-mr-1 -mt-1 rounded-md p-1 text-ink-subtle hover:bg-surface-2 hover:text-ink"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-8 text-[12.5px]" onClick={onDismiss}>
          {t("prompt.later")}
        </Button>
        <Button size="sm" className="h-8 text-[12.5px]" disabled={pending} onClick={onAllow}>
          {t("prompt.allow")}
        </Button>
      </div>
    </div>
  );
}
