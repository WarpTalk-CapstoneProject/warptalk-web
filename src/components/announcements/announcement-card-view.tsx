"use client";

/**
 * An announcement exactly as the people it is for see it.
 *
 * One component for both sides on purpose: the app banner's "read more" dialog renders it, and
 * so does the CMS editor's preview. An admin previewing a draft is looking at the same markup a
 * user will, not a second drawing of it that could drift.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";

import { SummaryMarkdown } from "@/components/markdown/document-markdown";
import { buttonVariants } from "@/components/ui/button";
import { isExternalLink, typeAccent } from "@/lib/announcements/announcement-cms";
import { cn } from "@/lib/utils";

export interface AnnouncementViewModel {
  title: string;
  bodyMarkdown: string;
  type: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export function AnnouncementTypePill({ type, className }: { type: string; className?: string }) {
  const t = useTranslations("common.announcements.types");
  const known = ["ANNOUNCEMENT", "FEATURE", "MAINTENANCE", "PROMOTION"].includes(type);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", typeAccent(type))} aria-hidden />
      {known ? t(type as "ANNOUNCEMENT") : type}
    </span>
  );
}

export function AnnouncementCta({
  label,
  url,
  onNavigate,
  size = "sm",
}: {
  label: string;
  url: string;
  onNavigate?: () => void;
  size?: "sm" | "default";
}) {
  // Styled as a button but rendered as a link, so it opens in a new tab on middle-click like
  // any other link does.
  if (isExternalLink(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={buttonVariants({ size })}
      >
        {label}
        <ArrowSquareOut size={13} />
      </a>
    );
  }
  return (
    <Link href={url} onClick={onNavigate} className={buttonVariants({ size })}>
      {label}
      <ArrowRight size={13} />
    </Link>
  );
}

export function AnnouncementCardView({
  announcement,
  className,
  onNavigate,
}: {
  announcement: AnnouncementViewModel;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <article className={cn("overflow-hidden rounded-xl border border-border bg-surface-1 shadow-linear", className)}>
      <div className={cn("h-1 w-full", typeAccent(announcement.type))} aria-hidden />
      <div className="p-5">
        <AnnouncementTypePill type={announcement.type} />
        <h2 className="mt-3 text-[17px] font-semibold leading-snug tracking-[-0.2px] text-ink">
          {announcement.title}
        </h2>
        <SummaryMarkdown className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
          {announcement.bodyMarkdown}
        </SummaryMarkdown>
        {announcement.ctaLabel && announcement.ctaUrl ? (
          <div className="mt-4">
            <AnnouncementCta label={announcement.ctaLabel} url={announcement.ctaUrl} onNavigate={onNavigate} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
