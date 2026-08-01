"use client";

import { useMemo, useState } from "react";
import { CheckCircle, SpeakerHigh } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { useSetPreferredVoice, useVoiceCatalog } from "@/hooks/use-voice-profiles";
import type { VoiceProfileDto } from "@/types/voice-profile";

/**
 * The bare ISO-639-1 code the AI worker keys its catalog by. The page's own language options
 * are locale-tagged ("vi-VN"), and the backend normalises anyway, but sending the bare code
 * keeps the react-query cache key stable across both spellings.
 */
function bareLanguage(language: string) {
  return language.split(/[-_]/)[0]?.toLowerCase() ?? language;
}

const LANGUAGES = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

/**
 * Browse the provider's public voices for a language and keep one as this user's default.
 *
 * The pick is stored per language as a voice profile (provider + providerVoiceId) and is
 * applied automatically the next time they join a room — see the room page, which hands it
 * to TranslationRoomHub.SetVoicePreference when they have not already chosen a voice in that
 * room. Choosing here never overrides an in-room choice.
 */
export function LibraryVoicePicker({ profiles }: { profiles: VoiceProfileDto[] }) {
  const [language, setLanguage] = useState("vi");
  const catalogQuery = useVoiceCatalog(language);
  const setPreferred = useSetPreferredVoice();

  const voices = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);

  const currentVoiceId = useMemo(() => {
    const match = profiles.find(
      (profile) =>
        profile.provider === "cartesia" &&
        profile.providerVoiceId &&
        bareLanguage(profile.language ?? "") === language,
    );
    return match?.providerVoiceId ?? null;
  }, [profiles, language]);

  async function choose(voiceId: string | null) {
    try {
      await setPreferred.mutateAsync({ language, voiceId });
      toast.success(
        voiceId ? "Đã đặt làm giọng mặc định." : "Đã bỏ giọng mặc định, quay lại giọng tự động.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Không lưu được giọng mặc định."));
    }
  }

  return (
    <section className="mx-4 space-y-4 border-b border-border py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-ink">Giọng có sẵn</h2>
          <p className="text-[13px] leading-5 text-ink-muted">
            Chọn một giọng làm mặc định cho ngôn ngữ này. Vào phòng họp sẽ tự áp dụng — bạn vẫn
            đổi được trong phòng bất cứ lúc nào.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentVoiceId && (
            <Button
              variant="ghost"
              className="h-[28px] rounded-full px-3 text-[13px] text-ink-muted hover:text-ink"
              disabled={setPreferred.isPending}
              onClick={() => void choose(null)}
            >
              Bỏ chọn
            </Button>
          )}
          <Select
            value={language}
            onValueChange={(value) => setLanguage(value ?? language)}
          >
            <SelectTrigger className="h-[28px] w-[150px] rounded-full text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {catalogQuery.isLoading ? (
        <p className="text-[13px] text-ink-subtle">Đang tải danh sách giọng…</p>
      ) : voices.length === 0 ? (
        // A cold catalog is the normal state before the AI worker's first synthesis for this
        // language — say so plainly instead of showing it as a failure.
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-[13px] text-ink-subtle">
          Chưa có giọng nào cho ngôn ngữ này. Danh sách sẽ xuất hiện sau lần dịch đầu tiên
          trong một cuộc họp.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map((voice) => {
            const active = voice.id === currentVoiceId;
            return (
              <button
                key={voice.id}
                type="button"
                disabled={setPreferred.isPending}
                onClick={() => void choose(active ? null : voice.id)}
                aria-pressed={active}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                  active
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 bg-surface-1 hover:border-border hover:bg-surface-2"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <SpeakerHigh size={14} weight="bold" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {voice.name}
                    </span>
                    {voice.gender && (
                      <span className="block text-[11px] capitalize text-ink-subtle">
                        {voice.gender}
                      </span>
                    )}
                  </span>
                </span>
                {active && <CheckCircle size={16} weight="fill" className="shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
