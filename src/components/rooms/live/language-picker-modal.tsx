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
import { getLanguageName } from "@/lib/languages";

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
          <DialogTitle>Chọn ngôn ngữ cho cuộc họp</DialogTitle>
          <DialogDescription className="text-ink-subtle pt-2">
            Chọn ngôn ngữ bạn sẽ nói và ngôn ngữ bạn muốn nghe — bạn có thể đổi lại bất cứ
            lúc nào từ thanh điều khiển trong cuộc họp. Bỏ qua để dùng chế độ tự động
            (hệ thống tự nhận diện giọng nói).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-[13px] font-medium text-ink">Bạn sẽ nói bằng ngôn ngữ nào?</label>
            <Select value={speakLanguage} onValueChange={(value) => setSpeakLanguage(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((language) => (
                  <SelectItem key={language} value={language}>
                    {getLanguageName(language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label className="text-[13px] font-medium text-ink">Bạn muốn nghe bằng ngôn ngữ nào?</label>
            <Select value={listenLanguage} onValueChange={(value) => setListenLanguage(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((language) => (
                  <SelectItem key={language} value={language}>
                    {getLanguageName(language)}
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
            Bỏ qua, dùng tự động
          </Button>
          <Button
            onClick={() => {
              onConfirm(speakLanguage, listenLanguage);
              onOpenChange(false);
            }}
          >
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
