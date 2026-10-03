"use client";

import { MentionIcon } from "@/components/assistant/message-mention-chips";
import { mentionToken, mentionTokenLabel, type MentionSegment } from "@/lib/assistant/message-mentions";
import type { AssistantPluginCatalogItemDto } from "@/types/assistant";

/**
 * What WarpBot's composer draws behind its textarea: the same string, glyph for glyph, with each
 * @mention as a chip and the Tab-completion suffix in grey.
 *
 * A textarea paints one colour and nothing inside it, so the chips are drawn here and the textarea
 * goes transparent over them (`paintText`) - its caret and selection stay its own. With no mention
 * this only shows the ghost suffix and the textarea paints its own text, as before.
 *
 * EVERY WIDTH MUST MATCH THE TEXTAREA'S, or the caret walks off the text: no padding, no font
 * weight, no added or removed character. So the mention's mark (the plugin's logo, a member's
 * initial, a document's icon) is laid OVER its "@" - a glyph nearly 1em wide, which a 12-14px mark
 * fits - and the chip's margin is a ring, drawn outside the box where it moves nothing (3 Oct
 * 2026: the token used to be a flat tint with no mark at all).
 */
export function ComposerMentionMirror({
  segments,
  plugins,
  ghost,
  paintText,
}: {
  segments: MentionSegment[];
  plugins: AssistantPluginCatalogItemDto[];
  ghost: string;
  paintText: boolean;
}) {
  return (
    <>
      {segments.map((part, index) =>
        part.kind === "mention" ? (
          <span key={index} className="rounded-[4px] bg-primary/10 text-primary ring-2 ring-primary/10">
            <span className="relative">
              <span className="text-transparent">@</span>
              <span className="absolute inset-0 flex items-center justify-center">
                <MentionIcon mention={part.mention} plugins={plugins} />
              </span>
            </span>
            {mentionToken(mentionTokenLabel(part.mention)).slice(1)}
          </span>
        ) : (
          <span key={index} className={paintText ? "text-ink" : "invisible"}>
            {part.text}
          </span>
        ),
      )}
      <span className="text-ink-subtle">{ghost}</span>
    </>
  );
}
