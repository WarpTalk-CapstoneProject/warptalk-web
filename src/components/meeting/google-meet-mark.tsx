import { cn } from "@/lib/utils";

/**
 * Whether a meeting happens on Google Meet, as the schedule decides it.
 *
 * Both fields, not the provider alone: the server refuses a provider without a link, so a row that
 * has one without the other is from before that rule, and a mark that opens nothing is worse than
 * no mark. One rule shared by the Agenda row, the Week card and the Month chip, so the three views
 * cannot disagree about the same meeting.
 */
export function isGoogleMeetMeeting(meeting: {
  externalProvider?: string | null;
  externalMeetingUrl?: string | null;
}): boolean {
  return meeting.externalProvider?.toUpperCase() === "GOOGLE_MEET" && Boolean(meeting.externalMeetingUrl);
}

/**
 * Google Meet's logo, drawn inline.
 *
 * Inline rather than `/assets/plugins/google-meet.svg` through an <img>: it sits in 12-14px chips
 * that the month grid measures with a hidden copy (`MonthRowProbe`), and an image that has not
 * loaded yet has no size to measure. The brand colours are fixed on purpose - they are the mark,
 * and they read on both themes.
 *
 * Decorative by default: every row that shows it already says "Google Meet" in its accessible name.
 */
export function GoogleMeetMark({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="16 28 170 136"
      className={cn("shrink-0", className)}
    >
      <path d="M16,42c0-7.73,6.27-14,14-14h106c7.73,0,14,6.27,14,14v108c0,7.73-6.27,14-14,14H30c-7.73,0-14-6.27-14-14V42z" fill="#00AC47" />
      <path d="M50,28h86c7.73,0,14,6.27,14,14v10L100,96V64H50V28z" fill="#FFBA00" />
      <path d="M50,28H30c-7.73,0-14,6.27-14,14v22h34V28z" fill="#EA4335" />
      <rect fill="#2684FC" height="64" width="34" x="16" y="64" />
      <path d="M16,128h34v36H30c-7.73,0-14-6.27-14-14V128z" fill="#0066DA" />
      <path d="M100,96l50-44v88L100,96z" fill="#00832D" />
      <path d="M150,64l26-21c3.7-3,9,0.3,9,4.5v97c0,4.2-5.3,7.5-9,4.5l-26-21V64z" fill="#00AC47" />
    </svg>
  );
}
