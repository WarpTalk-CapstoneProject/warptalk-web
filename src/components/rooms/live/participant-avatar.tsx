"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  describeParticipantLanguage,
  type ParticipantIdentity,
} from "@/lib/meeting/participant-identity";

/**
 * A participant's face, with the language they picked pinned to it.
 *
 * WHY ONE COMPONENT
 *   The meeting drew a person in four places — the tile placeholder, the people list, the caption
 *   lane and the transcript — and each drew its own two-letter square at its own size with its own
 *   colours. None of them showed the actual photograph, and none showed which language the person
 *   had chosen, which is the single most useful fact about somebody in a translation meeting.
 *
 * THE FLAG IS THE LISTEN LANGUAGE
 *   It used to be the speak language, on the reasoning that that is what everyone else hears
 *   translated. The listen language is the one the person actually picked — the meeting bar can no
 *   longer create a speak/listen split, and speech language is headed for detection rather than a
 *   dropdown, at which point the speak side stops being a choice and becomes a guess. A badge on a
 *   face carries the choice. Audio routing is unaffected: FilteredRoomAudio keys dub selection off
 *   the SPEAK language and never reads this. See describeParticipantLanguage.
 */
// WT-661: the badge holds a two-letter language code, not a flag emoji, so each row sizes a PILL
// rather than a circle — fixed height with horizontal padding, width following the text. A square
// big enough for two letters at `xs` would have been wider than the avatar it sits on.
const SIZES = {
  // Letters need more size than the flag did: a flag was recognisable by its colours at any size,
  // two grey letters are not. Each row is the largest badge that still leaves the face readable.
  xs: { box: "size-6", text: "text-[10px]", code: "h-3.5 px-[3px] text-[8px] -bottom-px -right-px" },
  sm: { box: "size-7", text: "text-[11px]", code: "h-4 px-1 text-[9px] -bottom-0.5 -right-0.5" },
  md: { box: "size-9", text: "text-[12px]", code: "h-[18px] px-1 text-[10px] -bottom-0.5 -right-1" },
  // The two big sizes pull the badge INWARDS. A round avatar's bottom-right bounding-box corner
  // is off the circle entirely, so the badge that reads as "attached" at 24px reads as a sticker
  // floating beside the head at 80px.
  lg: { box: "size-14", text: "text-[17px]", code: "h-5 px-1.5 text-[11px] bottom-0 right-0" },
  xl: { box: "size-20", text: "text-[24px]", code: "h-6 px-2 text-[13px] bottom-0.5 right-0.5" },
} as const;

export type ParticipantAvatarSize = keyof typeof SIZES;

export function ParticipantAvatar({
  identity,
  size = "sm",
  showCode = true,
  speaking = false,
  className = "",
}: {
  identity: ParticipantIdentity;
  size?: ParticipantAvatarSize;
  /** Off for surfaces that already print the language beside the name. */
  showCode?: boolean;
  /** Rings the face while this person holds the floor — the camera-off tile's only speech cue. */
  speaking?: boolean;
  className?: string;
}) {
  const sizing = SIZES[size];
  const language = describeParticipantLanguage(
    identity.speakLanguage,
    identity.listenLanguage,
  );
  const code = showCode && language?.code ? language.code : null;

  return (
    <span
      className={`relative inline-flex shrink-0 ${sizing.box} ${className}`}
      title={language?.label}
    >
      <Avatar
        className={`${sizing.box} bg-surface-2 ${
          speaking ? "ring-2 ring-primary ring-offset-1 ring-offset-surface-1" : ""
        }`}
      >
        {/* No <AvatarImage> at all when there is no URL: base-ui keeps the fallback mounted until
            an image resolves, and an <img src=""> resolves to an error against the page URL, which
            some browsers log as a failed request on every render. */}
        {identity.avatarUrl ? (
          <AvatarImage src={identity.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback
          className={`bg-surface-3 font-semibold text-ink ${sizing.text}`}
        >
          {identity.initials}
        </AvatarFallback>
      </Avatar>
      {code ? (
        <span
          aria-hidden
          className={`absolute grid place-items-center rounded-full bg-surface-1 font-semibold leading-none tracking-wide text-ink-muted shadow-sm ring-1 ring-border ${sizing.code}`}
        >
          {code}
        </span>
      ) : null}
      {language ? <span className="sr-only">{language.label}</span> : null}
    </span>
  );
}

/** The same badge without a face — for a name row that already has one, or has no room for one. */
export function ParticipantLanguageBadge({
  identity,
  className = "",
}: {
  identity: ParticipantIdentity;
  className?: string;
}) {
  const language = describeParticipantLanguage(
    identity.speakLanguage,
    identity.listenLanguage,
  );
  if (!language?.code) return null;

  return (
    <span
      title={language.label}
      className={`rounded bg-surface-3 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-ink-muted ${className}`}
      aria-label={language.label}
    >
      {language.code}
    </span>
  );
}
