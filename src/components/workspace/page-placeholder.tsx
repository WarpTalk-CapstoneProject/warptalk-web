import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const PRIMARY_PLACEHOLDER_ASSETS = {
  meetings: "/assets/illustrations/page-placeholders/meetings.png",
  documents:
    "/assets/illustrations/page-placeholders/documents-knowledge.png",
  glossary: "/assets/illustrations/page-placeholders/glossary.png",
  members: "/assets/illustrations/page-placeholders/members.png",
  tasks: "/assets/illustrations/page-placeholders/tasks.png",
  "voice-profiles": "/assets/illustrations/page-placeholders/voice-profiles.png",
  billing: "/assets/illustrations/page-placeholders/billing.png",
  "no-results": "/assets/illustrations/page-placeholders/no-results.png",
} as const;

export const PLACEHOLDER_ASSETS = {
  ...PRIMARY_PLACEHOLDER_ASSETS,
  schedules: PRIMARY_PLACEHOLDER_ASSETS.meetings,
  history: PRIMARY_PLACEHOLDER_ASSETS.meetings,
  knowledge: PRIMARY_PLACEHOLDER_ASSETS.documents,
} as const;

export type PagePlaceholderKind = keyof typeof PLACEHOLDER_ASSETS;

export function PagePlaceholder({
  kind,
  title,
  description,
  action,
  className,
}: {
  kind: PagePlaceholderKind;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[280px] flex-col items-center justify-center px-6 py-8 text-center",
        className,
      )}
    >
      {/*
        No blend mode. The art used to ship flattened onto a (247,247,248) matte with no alpha
        channel at all, and `mix-blend-multiply` was standing in for the transparency it did not
        have — which only ever works against pure white, so on this surface the matte stayed
        visible as a grey square behind every illustration. The PNGs carry real alpha now, so the
        blend is not merely unnecessary, it would darken whatever sits under them.

        invert + hue-rotate for dark mode: inverting alone flips the purple accent to yellow.
        Rotating the hue back a half turn restores it while keeping the lightness inverted, so
        light-grey linework reads on a dark surface and the accent stays the brand's.
      */}
      <Image
        src={PLACEHOLDER_ASSETS[kind]}
        alt=""
        aria-hidden="true"
        width={760}
        height={760}
        sizes="(max-width: 640px) 280px, 380px"
        // An empty state IS this picture — it is the largest thing on the page and it is in the
        // viewport the moment the page renders. Lazily loading it means waiting for hydration and
        // then a round trip before the page looks like anything, which is what "loads slowly"
        // was: not the file size alone, but that nothing even started fetching until after React
        // had run. The source art is also a tenth of the weight it was (flat line art was
        // shipping as 24-bit PNG at ~300KB; palette PNG carries it at ~25KB with the alpha and
        // the accent glow intact).
        priority
        className="-mb-16 -mt-12 h-auto w-[280px] select-none dark:hue-rotate-180 dark:invert sm:w-[380px]"
      />
      <p className="relative text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="relative mt-1 max-w-[420px] text-xs leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="relative mt-3">{action}</div> : null}
    </div>
  );
}
