"use client";

import { Fragment, type ReactNode } from "react";
import { FileText, PuzzlePiece, VideoCamera } from "@phosphor-icons/react";

import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { userMessageDisplayText } from "@/lib/assistant/confirmation-answer";
import { splitMentionTokens } from "@/lib/assistant/message-mentions";
import { cn } from "@/lib/utils";
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
  return (
    <span
      className={cn(
        "items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 text-[11px] font-medium text-primary whitespace-nowrap",
        // In a sentence it sits on the text's baseline and takes no more height than a line.
        inline ? "inline-flex py-px align-[1px] leading-4" : "flex py-0.5",
      )}
    >
      <MentionIcon mention={mention} plugins={plugins} />
      {mention.label}
    </span>
  );
}

function MentionIcon({
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
  }
}
