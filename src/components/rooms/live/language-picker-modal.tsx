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
 * Shown once, right after joining the live room (host and participant alike) —
 * lets a participant pick their speak/listen language up front instead of relying on
 * a later dropdown pick or the "auto" fallback. Skippable: closing it (Skip, backdrop,
 * Escape) leaves speak/listen language exactly as they already were (STT auto-detect +
 * the room's default listen language), the same behavior as before this modal existed.
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
  /** Pre-selected in the "speak" picker — omit/undefined leaves it on the first available option. */
  defaultSpeakLanguage?: string;
  /** Pre-selected in the "listen" picker. */
  defaultListenLanguage?: string;
  onConfirm: (speakLanguage: string, listenLanguage: string) => void;
  onSkip: () => void;
}) {
  const fallback = availableLanguages[0] ?? "en";
  const [speakLanguage, setSpeakLanguage] = useState(defaultSpeakLanguage || fallback);
  const [listenLanguage, setListenLanguage] = useState(defaultListenLanguage || fallback);

  function handleOpenChange(next: boolean) {
    if (!next) onSkip();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Choose your meeting languages</DialogTitle>
          <DialogDescription className="text-ink-subtle pt-2">
            Pick the language you&apos;ll speak and the one you want to hear — you can change
            either at any time from the meeting control bar. Skip to stay on automatic
            (we detect your spoken language for you).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-[13px] font-medium text-ink">Which language will you speak?</label>
            <Select value={speakLanguage} onValueChange={(value) => setSpeakLanguage(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) =>
                    value ? <LanguageLabel value={String(value)} /> : "Select language"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((language) => (
                  <SelectItem key={language} value={language}>
                    <LanguageLabel value={language} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label className="text-[13px] font-medium text-ink">Which language do you want to hear?</label>
            <Select value={listenLanguage} onValueChange={(value) => setListenLanguage(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) =>
                    value ? <LanguageLabel value={String(value)} /> : "Select language"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((language) => (
                  <SelectItem key={language} value={language}>
                    <LanguageLabel value={language} />
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
              onConfirm(speakLanguage, listenLanguage);
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
