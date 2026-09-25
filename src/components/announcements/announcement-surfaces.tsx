"use client";

/**
 * Every placement an announcement can have, drawn exactly once.
 *
 * The app renders these for the people an announcement is for, and the CMS preview renders the
 * same components for the admin writing it — so the preview is the product, not a second drawing
 * of it that could drift. Purely presentational: no queries, no events. Callers pass what happens
 * on close and on a button click.
 *
 *   TopBannerSurface       a strip across the content column, with a pager
 *   ModalSurface           the inside of a dialog (image, title, body, buttons)
 *   ToastSurface           a small card for the bottom corner
 *   NotificationCardSurface a card at the top of the bell panel
 *   DashboardCardSurface   a wide card on the workspace home
 */

import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  ArrowSquareOut,
  Bell,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Gift,
  Heart,
  Info,
  Lightning,
  Megaphone,
  Rocket,
  Sparkle,
  Star,
  Warning,
  Wrench,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  assetUrl,
  colorTokens,
  iconFor,
  isAllowedImage,
  isExternalLink,
  surfaceClasses,
  type IconName,
} from "@/lib/announcements/announcement-cms";
import { cn } from "@/lib/utils";

export interface AnnouncementViewModel {
  id?: string;
  title: string;
  bodyMarkdown: string;
  type: string;
  variant?: string;
  accentColor?: string;
  icon?: string | null;
  imageUrl?: string | null;
  dismissible?: boolean;
  ctaLabel: string | null;
  ctaUrl: string | null;
  secondaryCtaLabel?: string | null;
  secondaryCtaUrl?: string | null;
}

export interface SurfaceHandlers {
  /** Absent: no close button (a non-dismissible banner or card). */
  onClose?: () => void;
  onCta?: (secondary: boolean) => void;
  /**
   * The CMS preview: buttons do not navigate and links do not leave the editor, so an admin can
   * click around a preview without losing their draft.
   */
  inert?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5200/api/v1";

const ICON_COMPONENTS: Record<IconName, Icon> = {
  megaphone: Megaphone,
  sparkle: Sparkle,
  rocket: Rocket,
  wrench: Wrench,
  warning: Warning,
  gift: Gift,
  info: Info,
  calendar: CalendarBlank,
  lightning: Lightning,
  star: Star,
  bell: Bell,
  heart: Heart,
};

export function AnnouncementIcon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const Component = ICON_COMPONENTS[name] ?? Megaphone;
  return <Component size={size} weight="duotone" className={className} aria-hidden />;
}

/** The icon in a rounded tile, tinted with the accent (or inverted on a SOLID surface). */
function IconTile({ announcement, size = 32 }: { announcement: AnnouncementViewModel; size?: number }) {
  const tokens = colorTokens(announcement.accentColor ?? "BRAND");
  const solid = announcement.variant === "SOLID";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        solid ? "bg-white/15" : cn(tokens.subtle, tokens.text),
      )}
      style={{ width: size, height: size }}
    >
      <AnnouncementIcon name={iconFor(announcement.type, announcement.icon)} size={Math.round(size * 0.55)} />
    </span>
  );
}

export function resolveImage(url: string | null | undefined): string | null {
  if (!url || !isAllowedImage(url)) return null;
  return assetUrl(url, API_BASE);
}

/**
 * Announcement markdown: the summary styles, plus images — but only images the server would
 * accept (an uploaded asset or https), so a body cannot load a tracking pixel over http.
 */
export function AnnouncementMarkdown({
  children,
  className,
  onSolid,
}: {
  children: string;
  className?: string;
  onSolid?: boolean;
}) {
  const link = onSolid ? "underline underline-offset-2" : "text-primary underline underline-offset-2";
  return (
    <div className={cn("space-y-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <h4 className="mt-3 text-[14px] font-semibold">{children}</h4>,
          h2: ({ children }) => <h4 className="mt-3 text-[13.5px] font-semibold">{children}</h4>,
          h3: ({ children }) => <h5 className="mt-2.5 text-[13px] font-semibold">{children}</h5>,
          h4: ({ children }) => <h5 className="mt-2.5 text-[13px] font-semibold">{children}</h5>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-4">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-black/5 px-1 py-px font-mono text-[0.92em] dark:bg-white/10">{children}</code>
          ),
          blockquote: ({ children }) => <blockquote className="border-l-2 border-current/30 pl-2.5 opacity-80">{children}</blockquote>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
              {children}
            </a>
          ),
          hr: () => <hr className="border-current/15" />,
          img: ({ src, alt }) => {
            const resolved = typeof src === "string" ? resolveImage(src) : null;
            if (!resolved) return null;
            // eslint-disable-next-line @next/next/no-img-element -- remote, admin-uploaded; next/image needs a fixed host list
            return <img src={resolved} alt={alt ?? ""} loading="lazy" className="my-1 max-h-72 w-auto max-w-full rounded-md" />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function CtaLink({
  label,
  url,
  primary,
  onSolid,
  size,
  inert,
  onClick,
}: {
  label: string;
  url: string;
  primary: boolean;
  onSolid: boolean;
  size: "xs" | "sm";
  inert?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    buttonVariants({ size, variant: primary ? "default" : "ghost" }),
    onSolid && primary && "bg-white text-black hover:bg-white/90",
    onSolid && !primary && "text-current hover:bg-white/15",
  );
  const external = isExternalLink(url);
  const content = (
    <>
      {label}
      {primary ? external ? <ArrowSquareOut size={12} /> : <ArrowRight size={12} /> : null}
    </>
  );
  if (inert) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }
  if (external) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {content}
      </a>
    );
  }
  return (
    <Link href={url} className={className} onClick={onClick}>
      {content}
    </Link>
  );
}

export function AnnouncementCtas({
  announcement,
  onCta,
  inert,
  size = "sm",
  className,
}: {
  announcement: AnnouncementViewModel;
  onCta?: (secondary: boolean) => void;
  inert?: boolean;
  size?: "xs" | "sm";
  className?: string;
}) {
  const onSolid = announcement.variant === "SOLID";
  if (!announcement.ctaLabel || !announcement.ctaUrl) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <CtaLink
        label={announcement.ctaLabel}
        url={announcement.ctaUrl}
        primary
        onSolid={onSolid}
        size={size}
        inert={inert}
        onClick={() => onCta?.(false)}
      />
      {announcement.secondaryCtaLabel && announcement.secondaryCtaUrl ? (
        <CtaLink
          label={announcement.secondaryCtaLabel}
          url={announcement.secondaryCtaUrl}
          primary={false}
          onSolid={onSolid}
          size={size}
          inert={inert}
          onClick={() => onCta?.(true)}
        />
      ) : null}
    </div>
  );
}

function CloseButton({ onClose, onSolid, label }: { onClose: () => void; onSolid: boolean; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={onClose}
      className={cn("shrink-0", onSolid && "text-current hover:bg-white/15 hover:text-current")}
    >
      <X size={14} />
    </Button>
  );
}

/** The accent + variant ground every surface is painted on. */
function surface(announcement: AnnouncementViewModel): string {
  return surfaceClasses(announcement.variant ?? "SUBTLE", announcement.accentColor ?? "BRAND");
}

// ── Top banner ──────────────────────────────────────────────────────────────────────────────

export function TopBannerSurface({
  announcement,
  position,
  total,
  onPrevious,
  onNext,
  onReadMore,
  ...handlers
}: SurfaceHandlers & {
  announcement: AnnouncementViewModel;
  position?: number;
  total?: number;
  onPrevious?: () => void;
  onNext?: () => void;
  onReadMore?: () => void;
}) {
  const t = useTranslations("common.announcements");
  const onSolid = announcement.variant === "SOLID";
  return (
    <section
      aria-label={t("regionLabel")}
      className={cn("relative flex shrink-0 items-center gap-3 border-x-0 border-t-0 py-2 pl-4 pr-2", surface(announcement), "rounded-none")}
    >
      {announcement.variant !== "SOLID" ? (
        <span className={cn("absolute inset-y-0 left-0 w-1", colorTokens(announcement.accentColor ?? "BRAND").bar)} aria-hidden />
      ) : null}
      <IconTile announcement={announcement} size={24} />
      <p className="min-w-0 flex-1 truncate text-[13px]">
        <span className="font-medium">{announcement.title}</span>
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {onReadMore ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReadMore}
            className={cn(onSolid && "text-current hover:bg-white/15 hover:text-current")}
          >
            {t("readMore")}
          </Button>
        ) : null}
        <AnnouncementCtas
          announcement={announcement}
          onCta={handlers.onCta}
          inert={handlers.inert}
          className="hidden sm:flex"
        />
        {total && total > 1 ? (
          <div className="flex items-center" aria-label={t("pagerLabel")}>
            <Button variant="ghost" size="icon-sm" aria-label={t("previous")} disabled={!position} onClick={onPrevious}>
              <CaretLeft size={14} />
            </Button>
            <span className="px-1 text-[11px] tabular-nums opacity-70">
              {t("position", { current: (position ?? 0) + 1, total })}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("next")}
              disabled={(position ?? 0) >= total - 1}
              onClick={onNext}
            >
              <CaretRight size={14} />
            </Button>
          </div>
        ) : null}
        {handlers.onClose ? <CloseButton onClose={handlers.onClose} onSolid={onSolid} label={t("dismiss")} /> : null}
      </div>
    </section>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────────────────────

/** The inside of the dialog. The host wraps it in a Dialog; the preview in a mock backdrop. */
export function ModalSurface({
  announcement,
  footer,
  ...handlers
}: SurfaceHandlers & { announcement: AnnouncementViewModel; footer?: ReactNode }) {
  const t = useTranslations("common.announcements");
  const image = resolveImage(announcement.imageUrl);
  const onSolid = announcement.variant === "SOLID";
  return (
    <article className={cn("relative overflow-hidden rounded-xl", surface(announcement))}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded asset on the API origin
        <img src={image} alt="" className="aspect-[16/7] w-full object-cover" />
      ) : (
        <div className={cn("h-1 w-full", colorTokens(announcement.accentColor ?? "BRAND").bar)} aria-hidden />
      )}
      {handlers.onClose ? (
        <div className="absolute right-2 top-2">
          <CloseButton onClose={handlers.onClose} onSolid={onSolid || Boolean(image)} label={t("close")} />
        </div>
      ) : null}
      <div className="p-5">
        <IconTile announcement={announcement} size={36} />
        <h2 className="mt-3 text-[18px] font-semibold leading-snug tracking-[-0.2px]">{announcement.title}</h2>
        <AnnouncementMarkdown onSolid={onSolid} className={cn("mt-2 text-[13.5px] leading-relaxed", !onSolid && "text-ink-muted")}>
          {announcement.bodyMarkdown}
        </AnnouncementMarkdown>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <AnnouncementCtas announcement={announcement} onCta={handlers.onCta} inert={handlers.inert} />
          {footer}
        </div>
      </div>
    </article>
  );
}

// ── Toast ───────────────────────────────────────────────────────────────────────────────────

export function ToastSurface({ announcement, ...handlers }: SurfaceHandlers & { announcement: AnnouncementViewModel }) {
  const t = useTranslations("common.announcements");
  const onSolid = announcement.variant === "SOLID";
  return (
    <article
      role="status"
      className={cn(
        "flex w-[360px] max-w-[calc(100vw-32px)] gap-3 rounded-xl p-3.5 shadow-[0_16px_40px_-12px_rgba(17,18,20,0.35)]",
        surface(announcement),
        announcement.variant === "SUBTLE" && "bg-surface-1",
      )}
    >
      <IconTile announcement={announcement} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug">{announcement.title}</p>
        <AnnouncementMarkdown onSolid={onSolid} className={cn("mt-1 line-clamp-3 text-[12.5px] leading-relaxed", !onSolid && "text-ink-muted")}>
          {announcement.bodyMarkdown}
        </AnnouncementMarkdown>
        <AnnouncementCtas announcement={announcement} onCta={handlers.onCta} inert={handlers.inert} size="xs" className="mt-2.5" />
      </div>
      {handlers.onClose ? <CloseButton onClose={handlers.onClose} onSolid={onSolid} label={t("close")} /> : null}
    </article>
  );
}

// ── Notification-centre card ────────────────────────────────────────────────────────────────

export function NotificationCardSurface({ announcement, ...handlers }: SurfaceHandlers & { announcement: AnnouncementViewModel }) {
  const t = useTranslations("common.announcements");
  const onSolid = announcement.variant === "SOLID";
  return (
    <article className={cn("relative flex gap-3 rounded-[14px] p-3", surface(announcement))}>
      <IconTile announcement={announcement} size={30} />
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] opacity-70">{t("badge")}</p>
        <p className="mt-0.5 text-[13.5px] font-semibold leading-snug">{announcement.title}</p>
        <AnnouncementMarkdown onSolid={onSolid} className={cn("mt-1 line-clamp-3 text-[12.5px] leading-relaxed", !onSolid && "text-ink-muted")}>
          {announcement.bodyMarkdown}
        </AnnouncementMarkdown>
        <AnnouncementCtas announcement={announcement} onCta={handlers.onCta} inert={handlers.inert} size="xs" className="mt-2" />
      </div>
      {handlers.onClose ? <CloseButton onClose={handlers.onClose} onSolid={onSolid} label={t("dismiss")} /> : null}
    </article>
  );
}

// ── Dashboard card ──────────────────────────────────────────────────────────────────────────

export function DashboardCardSurface({ announcement, ...handlers }: SurfaceHandlers & { announcement: AnnouncementViewModel }) {
  const t = useTranslations("common.announcements");
  const image = resolveImage(announcement.imageUrl);
  const onSolid = announcement.variant === "SOLID";
  return (
    <article className={cn("relative flex overflow-hidden rounded-xl", surface(announcement))}>
      <div className="flex min-w-0 flex-1 gap-3.5 p-4">
        <IconTile announcement={announcement} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">{announcement.title}</p>
          <AnnouncementMarkdown onSolid={onSolid} className={cn("mt-1 line-clamp-4 text-[13px] leading-relaxed", !onSolid && "text-ink-muted")}>
            {announcement.bodyMarkdown}
          </AnnouncementMarkdown>
          <AnnouncementCtas announcement={announcement} onCta={handlers.onCta} inert={handlers.inert} className="mt-3" />
        </div>
      </div>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded asset on the API origin
        <img src={image} alt="" className="hidden w-[34%] max-w-[280px] object-cover sm:block" />
      ) : null}
      {handlers.onClose ? (
        <div className="absolute right-2 top-2">
          <CloseButton onClose={handlers.onClose} onSolid={onSolid || Boolean(image)} label={t("dismiss")} />
        </div>
      ) : null}
    </article>
  );
}

/** The full announcement, as the banner's "Read more" opens it. */
export function AnnouncementArticle({
  announcement,
  footer,
  ...handlers
}: SurfaceHandlers & { announcement: AnnouncementViewModel; footer?: ReactNode }) {
  return <ModalSurface announcement={{ ...announcement, variant: "OUTLINE" }} footer={footer} {...handlers} />;
}
