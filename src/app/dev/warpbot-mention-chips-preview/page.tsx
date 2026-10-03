"use client";

/**
 * WarpBot's @mention chips, in the composer and in a sent message (3 Oct 2026). Not linked from
 * anywhere. The composer here is the REAL mirror component under a real textarea with the same
 * classes as the widget's, so a chip that pushed a glyph would show as a caret off its letter.
 */

import { useMemo, useState } from "react";

import { ComposerMentionMirror } from "@/components/assistant/composer-mention-mirror";
import { UserMessageBody } from "@/components/assistant/message-mention-chips";
import { splitMentionTokens } from "@/lib/assistant/message-mentions";
import { cn } from "@/lib/utils";
import type { AssistantMentionDto, AssistantPluginCatalogItemDto } from "@/types/assistant";

const plugin = (key: string, label: string): AssistantPluginCatalogItemDto =>
  ({ key, label, avatarUrl: `/assets/plugins/${key.replace("_", "-")}.svg` }) as AssistantPluginCatalogItemDto;

const PLUGINS = [plugin("linear", "Linear"), plugin("notion", "Notion"), plugin("google_drive", "Google Drive")];

const MENTIONS: AssistantMentionDto[] = [
  { entityType: "plugin", entityId: "linear", label: "Linear" },
  { entityType: "plugin", entityId: "notion", label: "Notion" },
  { entityType: "document", entityId: "doc-1", label: "Roadmap Q4" },
  { entityType: "member", entityId: "u-1", label: "Tuấn" }, // i18n-allow: a person's name
] as AssistantMentionDto[];

export default function WarpbotMentionChipsPreviewPage() {
  // i18n-allow: a sample Vietnamese prompt - the chips must sit right in the language users type
  const [value, setValue] = useState("@Linear kiểm tra danh sách ticket của @Tuấn, rồi ghi tóm tắt vào @Notion theo @Roadmap Q4");
  const segments = useMemo(() => splitMentionTokens(value, MENTIONS).segments, [value]);
  const hasMention = segments.some((part) => part.kind === "mention");

  return (
    <div className="flex min-h-dvh flex-col gap-8 bg-surface-1 p-8 text-ink">
      <section className="flex w-[420px] flex-col gap-2">
        <h2 className="text-[12px] font-medium text-ink-subtle">Composer (type to check the caret stays on its letter)</h2>
        <div className="rounded-[12px] border border-border bg-surface-1 px-2 py-1.5">
          <div className="relative flex-1 min-w-[120px]">
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden text-[13px] whitespace-pre-wrap break-words">
              <ComposerMentionMirror segments={segments} plugins={PLUGINS} ghost="" paintText={hasMention} />
            </div>
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={3}
              className={cn(
                "relative block w-full bg-transparent resize-none overflow-y-auto outline-none text-[13px] placeholder:text-ink-subtle",
                hasMention ? "text-transparent caret-ink" : "text-ink",
              )}
            />
          </div>
        </div>
      </section>

      <section className="flex w-[420px] flex-col gap-2">
        <h2 className="text-[12px] font-medium text-ink-subtle">Sent message</h2>
        <div className="self-end max-w-[85%] rounded-2xl bg-primary/5 px-3 py-2 text-[13px] leading-relaxed">
          <UserMessageBody content={value} mentions={MENTIONS} plugins={PLUGINS} />
        </div>
      </section>
    </div>
  );
}
