"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  speakerColorVar,
  speakerInitials,
  type TranscriptSpeaker,
} from "@/lib/transcript/speaker-color";
import { cn } from "@/lib/utils";

/**
 * The face beside a name in a saved transcript.
 *
 * Small on purpose. A transcript is a wall of text and the avatar is an aid to scanning it, not a
 * participant tile — at the size the meeting uses it would outweigh the sentence beside it and
 * turn every line into a card.
 *
 * The speaker's colour is carried as the ring, and as the tint behind their initials, so somebody
 * with no picture is still marked in the same colour as everything else of theirs on the page.
 * Most people have no picture: an avatar is a thing you upload and nobody has to. The colour is
 * what actually does the work here, and it works whether or not the face ever arrives.
 */
export function TranscriptSpeakerAvatar({
  speaker,
  className,
}: {
  speaker: TranscriptSpeaker;
  className?: string;
}) {
  const color = speakerColorVar(speaker.id);

  return (
    <Avatar
      className={cn("size-[18px] shrink-0 ring-1", className)}
      style={{
        // A ring in the speaker's colour and a wash of the same behind it. color-mix keeps the
        // tint honest in both themes: a fixed alpha over a dark surface is a different colour
        // from the same alpha over a white one.
        "--speaker": color,
        boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 55%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 16%, var(--surface-1))`,
      } as React.CSSProperties}
      title={speaker.name}
    >
      {/* No <AvatarImage> at all without a URL: base-ui keeps the fallback mounted until an image
          resolves, and an <img src=""> resolves against the page URL and logs a failed request on
          every render. Same reason ParticipantAvatar does it this way. */}
      {speaker.avatarUrl ? <AvatarImage src={speaker.avatarUrl} alt="" /> : null}
      <AvatarFallback
        className="bg-transparent text-[9px] font-bold leading-none"
        style={{ color }}
      >
        {speakerInitials(speaker.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The stripe that runs the height of everything one person said.
 *
 * This is the part that answers "where does this person stop talking" — a name has to be read,
 * and a colour running down the edge of a paragraph does not. Rendered as a positioned element
 * rather than a border so it survives a row that scrolls, wraps or gets highlighted, and so the
 * highlight ring around a cited line does not have to fight it for the same edge.
 */
export function TranscriptSpeakerStripe({
  speaker,
  className,
}: {
  speaker: TranscriptSpeaker;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("absolute inset-y-0 left-0 w-[3px] rounded-full", className)}
      style={{ backgroundColor: speakerColorVar(speaker.id) }}
    />
  );
}
