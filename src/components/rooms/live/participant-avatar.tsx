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
 * THE FLAG IS THE SPEAK LANGUAGE
 *   That is what everyone else is hearing translated. When a participant's listen language differs
 *   (a split the meeting bar can no longer create, but stored profiles still carry), the tooltip
 *   says both. See describeParticipantLanguage.
 */
const SIZES = {
  xs: { box: "size-6", text: "text-[10px]", flag: "size-3.5 text-[8px] -bottom-px -right-px" },
  sm: { box: "size-7", text: "text-[11px]", flag: "size-4 text-[9px] -bottom-0.5 -right-0.5" },
  md: { box: "size-9", text: "text-[12px]", flag: "size-[18px] text-[10px] -bottom-0.5 -right-0.5" },
  // The two big sizes pull the badge INWARDS. A round avatar's bottom-right bounding-box corner
  // is off the circle entirely, so the badge that reads as "attached" at 24px reads as a sticker
  // floating beside the head at 80px.
  lg: { box: "size-14", text: "text-[17px]", flag: "size-6 text-[13px] bottom-0 right-0" },
  xl: { box: "size-20", text: "text-[24px]", flag: "size-7 text-[15px] bottom-0.5 right-0.5" },
} as const;

export type ParticipantAvatarSize = keyof typeof SIZES;

export function ParticipantAvatar({
  identity,
  size = "sm",
  showFlag = true,
  speaking = false,
  className = "",
}: {
  identity: ParticipantIdentity;
  size?: ParticipantAvatarSize;
  /** Off for surfaces that already print the language beside the name. */
  showFlag?: boolean;
  /** Rings the face while this person holds the floor — the camera-off tile's only speech cue. */
  speaking?: boolean;
  className?: string;
}) {
  const sizing = SIZES[size];
  const language = describeParticipantLanguage(
    identity.speakLanguage,
    identity.listenLanguage,
  );
  const flag = showFlag && language?.flag ? language.flag : null;

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
      {flag ? (
        <span
          aria-hidden
          className={`absolute grid place-items-center rounded-full bg-surface-1 leading-none shadow-sm ring-1 ring-border ${sizing.flag}`}
        >
          {flag}
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
  if (!language?.flag) return null;

  return (
    <span
      title={language.label}
      className={`leading-none ${className}`}
      aria-label={language.label}
    >
      {language.flag}
    </span>
  );
}
