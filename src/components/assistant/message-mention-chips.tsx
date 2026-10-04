"use client";

import { Fragment, type ReactNode } from "react";
import { FileText, PuzzlePiece, Sparkle, Subtitles, VideoCamera } from "@phosphor-icons/react";

import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { userMessageDisplayText } from "@/lib/assistant/confirmation-answer";
import { mentionTokenLabel, splitMentionTokens } from "@/lib/assistant/message-mentions";
import type { AssistantMentionDto, AssistantPluginCatalogItemDto } from "@/types/assistant";

/**
 * The @mentions a user message went out with, drawn under that message in WarpBot's thread.
 *
 * They used to be dropped at send: the composer's chips cleared, the bubble showed "set up a
 * meeting for me", and neither the user nor anyone scrolling back could tell which plugin had
 * been pointed at — only that WarpBot had somehow picked one.
 *
 * Built from the WIRE shape (AssistantMentionDto), not from the composer's option objects, so a
 * message sent a moment ago and the same message replayed out of history draw the same chip.
 * The icon is re-derived here for the same reason: history has no ReactNode to hand back.
 *
 * A plugin that has since been uninstalled has no catalog row to draw a logo from; it keeps its
 * label and falls back to a generic plugin mark. What was mentioned is the record — whether it
 * is still installed is a different question this chip does not answer.
 */
export function MessageMentionChips({
  mentions,
  plugins,
}: {
  mentions: AssistantMentionDto[];
  plugins: AssistantPluginCatalogItemDto[];
}) {
  if (mentions.length === 0) return null;

  return (
    <div className="mb-1 flex flex-wrap justify-end gap-1">
      {mentions.map((mention) => (
        <MentionChip
          key={`${mention.entityType}:${mention.entityId}`}
          mention={mention}
          plugins={plugins}
        />
      ))}
    </div>
  );
}

/**
 * A user message as the user wrote it: each @mention drawn as a chip where it was typed, and an
 * answer to a confirmation card without its token (see userMessageDisplayText).
 *
 * Mentions whose token is not in the text — anything sent before the composer kept it — still
 * get the row above, so old messages draw exactly as they did. `children` goes between that row
 * and the text, which is where the attachments sit.
 */
export function UserMessageBody({
  content,
  mentions,
  plugins,
  children,
}: {
  content: string;
  mentions: AssistantMentionDto[];
  plugins: AssistantPluginCatalogItemDto[];
  children?: ReactNode;
}) {
  const { segments, unplaced } = splitMentionTokens(userMessageDisplayText(content), mentions);
  return (
    <>
      <MessageMentionChips mentions={unplaced} plugins={plugins} />
      {children}
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <MentionChip key={index} mention={segment.mention} plugins={plugins} inline />
        ),
      )}
    </>
  );
}

function MentionChip({
  mention,
  plugins,
  inline = false,
}: {
  mention: AssistantMentionDto;
  plugins: AssistantPluginCatalogItemDto[];
  inline?: boolean;
}) {
  // "Summary · Standup" for a meeting's summary or transcript: the bare title is also what a
  // mention of the room itself shows, and the icon alone is too small to tell them apart.
  const label = mentionTokenLabel(mention);

  if (inline) {
    // In a sentence the chip is TEXT, not a flex box (3 Oct 2026). An 11px inline-flex box nudged
    // by `align-[1px]` sat on its own synthesized baseline - the icon's bottom edge - so it rode
    // visibly off the line of the words around it. As an inline span at the sentence's own size
    // the label shares the baseline exactly, and only the icon is aligned, against the x-height.
    return (
      <span className="mx-px whitespace-nowrap rounded-[5px] bg-primary/10 px-1 py-px font-medium text-primary">
        {/* A fixed box with nothing in flow, so every kind of mark shares one baseline: an
            inline-flex box took its baseline from whatever text it held, and a member's 7px
            initial dragged that chip half a line low. */}
        <span className="relative mr-1 inline-block size-3.5 align-[-0.2em]">
          <span className="absolute inset-0 flex items-center justify-center">
            <MentionIcon mention={mention} plugins={plugins} />
          </span>
        </span>
        {label}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 whitespace-nowrap rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
      <MentionIcon mention={mention} plugins={plugins} />
      {label}
    </span>
  );
}

/** A mention's mark: the plugin's own logo, a member's initial, or the kind of thing it names. */
export function MentionIcon({
  mention,
  plugins,
}: {
  mention: AssistantMentionDto;
  plugins: AssistantPluginCatalogItemDto[];
}) {
  switch (mention.entityType) {
    case "plugin": {
      const plugin = plugins.find((item) => item.key === mention.entityId);
      return plugin ? (
        <PluginGlyph plugin={plugin} size="xs" className="size-3.5 rounded-[3px] border-0 text-[6px] shadow-none" />
      ) : (
        <PuzzlePiece size={12} className="shrink-0" />
      );
    }
    case "member":
      return (
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-ink text-[7px] font-bold text-white">
          {(mention.label || "?").slice(0, 1).toUpperCase()}
        </span>
      );
    case "room":
      return <VideoCamera size={12} className="shrink-0" />;
    case "document":
      return <FileText size={12} className="shrink-0" />;
    // WT-887. Sparkle is what the artifact library marks a summary with; a transcript gets its own
    // mark rather than the library's FileText, which here already means a document.
    case "summary":
      return <Sparkle size={12} className="shrink-0" />;
    case "transcript":
      return <Subtitles size={12} className="shrink-0" />;
  }
}
