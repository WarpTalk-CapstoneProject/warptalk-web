import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Translate, MicrophoneStage } from "@phosphor-icons/react/dist/ssr";

const languageOptions = [
  { code: "en", label: "English" },
  { code: "vi", label: "Vietnamese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
];

export function LanguageRoleConfirm({
  isHost,
  roomSourceLanguage,
  roomTargetLanguages,
  listenLanguage,
  setListenLanguage,
  speakLanguage,
  setSpeakLanguage
}: {
  isHost: boolean;
  roomSourceLanguage: string;
  roomTargetLanguages: string[];
  listenLanguage: string;
  setListenLanguage: (val: string) => void;
  speakLanguage: string;
  setSpeakLanguage: (val: string) => void;
}) {
  const availableLanguages = languageOptions.filter(l => 
    l.code === roomSourceLanguage || roomTargetLanguages.includes(l.code)
  );

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <h4 className="text-[13px] font-medium text-ink tracking-[0.4px]">Your Role & Language</h4>
      
      {isHost ? (
        <div className="bg-surface-2/50 rounded-[8px] p-3 text-[13px] text-ink-muted leading-relaxed">
          You are the host of this meeting. The source language is set to <strong className="text-ink font-medium">{languageOptions.find(l => l.code === roomSourceLanguage)?.label || roomSourceLanguage}</strong>.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium flex items-center gap-1.5 text-ink-muted">
              <Translate className="w-4 h-4 text-ink-muted" /> Language you will hear
            </label>
            <Select value={listenLanguage} onValueChange={(val) => val && setListenLanguage(val)}>
              <SelectTrigger className="h-[32px] bg-canvas border border-border text-ink text-[13px] rounded-[6px] w-full focus:ring-2 focus:ring-ring/50 focus:border-ring">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent className="bg-surface-1 border-border text-ink rounded-[6px]">
                {availableLanguages.map(lang => (
                  <SelectItem key={`listen-${lang.code}`} value={lang.code} className="focus:bg-surface-2 focus:text-ink text-[13px]">
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium flex items-center gap-1.5 text-ink-muted">
              <MicrophoneStage className="w-4 h-4 text-ink-muted" /> Language you will speak
            </label>
            <Select value={speakLanguage} onValueChange={(val) => val && setSpeakLanguage(val)}>
              <SelectTrigger className="h-[32px] bg-canvas border border-border text-ink text-[13px] rounded-[6px] w-full focus:ring-2 focus:ring-ring/50 focus:border-ring">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent className="bg-surface-1 border-border text-ink rounded-[6px]">
                {availableLanguages.map(lang => (
                  <SelectItem key={`speak-${lang.code}`} value={lang.code} className="focus:bg-surface-2 focus:text-ink text-[13px]">
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
