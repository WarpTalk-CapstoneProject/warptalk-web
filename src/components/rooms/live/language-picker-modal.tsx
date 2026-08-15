"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LanguageLabel } from "@/components/language/language-label";

/**
 * Shown once, right after joining the live room (host and participant alike) — lets a
 * participant name THEIR language up front instead of relying on a later dropdown pick or the
 * "auto" fallback. Skippable: closing it (Skip, backdrop, Escape) leaves speak/listen exactly as
 * they already were (STT auto-detect + the room's default listen language), the same behavior as
 * before this modal existed.
 *
 * ONE QUESTION, NOT TWO
 *   This asked "which language will you speak?" and "which do you want to hear?" as separate
 *   selects, defaulted from two different sources, at the moment somebody is trying to get into
 *   a call. It is the FIRST thing a participant sees, so it is also the main way a speak/listen
 *   split ever got created — and once created, every downstream control inherited it.
 *
 *   The meeting bar's picker was merged to one language for the same reason
 *   (lib/meeting/language-choice.ts). Leaving two questions here would have meant the product
 *   asked for a pair on the way in and refused to show one afterwards.
 *
 *   `onConfirm` still takes (speak, listen) — the wire format is two fields and a split
 *   configured elsewhere still routes — but this dialog can only ever produce a matched pair.
 */
export function LanguagePickerModal({
  open,
  onOpenChange,
  availableLanguages,
  defaultSpeakLanguage,
  defaultListenLanguage,
  onConfirm,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableLanguages: string[];
  /** Pre-selection — omit/undefined leaves it on the first available option. */
  defaultSpeakLanguage?: string;
  /**
   * Only consulted when there is no speak default. It is NOT a second answer any more: the
   * dialog writes one language to both sides, and the language a participant speaks is the
   * better guess at who they are than the language the room happened to default them to.
   */
  defaultListenLanguage?: string;
  /** Always called with the same value twice — see the module comment. */
  onConfirm: (speakLanguage: string, listenLanguage: string) => void;
  onSkip: () => void;
}) {
  const fallback = availableLanguages[0] ?? "en";
  const [language, setLanguage] = useState(
    defaultSpeakLanguage || defaultListenLanguage || fallback,
  );

  function handleOpenChange(next: boolean) {
    if (!next) onSkip();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Choose your language</DialogTitle>
          <DialogDescription className="text-ink-subtle pt-2">
            Everyone else is translated into it, and it is what your microphone is transcribed
            as. You can change it at any time from the meeting control bar. Skip to stay on
            automatic (we detect your spoken language for you).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-[13px] font-medium text-ink">Which language do you use?</label>
            <Select value={language} onValueChange={(value) => setLanguage(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) =>
                    value ? <LanguageLabel value={String(value)} /> : "Select language"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((option) => (
                  <SelectItem key={option} value={option}>
                    <LanguageLabel value={option} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onSkip();
              onOpenChange(false);
            }}
            className="bg-surface-2 hover:bg-surface-3 text-ink border-border"
          >
            Skip, use automatic
          </Button>
          <Button
            onClick={() => {
              // The same value twice, deliberately. Both fields still travel to the gateway —
              // the mesh reads them independently — and writing only one is the half-applied
              // state the merge exists to remove.
              onConfirm(language, language);
              onOpenChange(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
