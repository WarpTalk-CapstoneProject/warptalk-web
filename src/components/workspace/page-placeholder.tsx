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
      <Image
        src={PLACEHOLDER_ASSETS[kind]}
        alt=""
        aria-hidden="true"
        width={1254}
        height={1254}
        sizes="(max-width: 640px) 280px, 380px"
        className="-mb-16 -mt-12 h-auto w-[280px] select-none mix-blend-multiply dark:invert dark:mix-blend-screen sm:w-[380px]"
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
