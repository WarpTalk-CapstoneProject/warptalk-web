"use client";

/**
 * A real picture of an email on a card: the HTML the server renders for recipients (the same
 * renderer that sends mail), with the default sample data, drawn at its design width and scaled
 * into the card.
 *
 * The frame is `sandbox=""` (no scripts, no forms, no same-origin access), inert
 * (`pointer-events: none`, out of the tab order, hidden from screen readers — the card's own
 * button carries the label) and loaded only when the card scrolls into view. Renders are cached
 * for five minutes by React Query, so a grid of twelve thumbnails is twelve requests once.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { useRenderedEmail } from "@/hooks/use-admin-email-templates";
import { useRenderedBlock } from "@/hooks/use-admin-email-blocks";
import { EMAIL_DESIGN_WIDTH, thumbnailDocument, thumbnailScale } from "@/lib/admin/email-library";
import { cn } from "@/lib/utils";

/** True once the element has been on screen; stays true (a thumbnail never unloads). */
export function useInViewOnce<T extends Element>(rootMargin = "200px"): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no observer: load at once
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, seen]);
  return [ref, seen];
}

function useWidth<T extends Element>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * The presentational frame: give it the rendered HTML. Clicking anywhere on it calls `onOpen`
 * (the "as received" preview).
 */
export function EmailThumbnailFrame({
  html,
  loading,
  error,
  label,
  onOpen,
  height = 200,
  badge,
  dark,
  className,
}: {
  html: string | undefined;
  loading?: boolean;
  error?: boolean;
  label: string;
  onOpen?: () => void;
  height?: number;
  badge?: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  const t = useTranslations("adminCms.library.thumbnail");
  const [box, width] = useWidth<HTMLDivElement>();
  const scale = thumbnailScale(width);

  return (
    <div
      ref={box}
      className={cn(
        "group/thumb relative overflow-hidden rounded-md border border-border",
        dark ? "bg-[#111214]" : "bg-[#f4f4f5]",
        className,
      )}
      style={{ height }}
    >
      {html ? (
        <iframe
          title={label}
          sandbox=""
          srcDoc={thumbnailDocument(html)}
          tabIndex={-1}
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: EMAIL_DESIGN_WIDTH, height: Math.ceil(height / Math.max(scale, 0.1)), transform: `scale(${scale})` }}
        />
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[11.5px] text-ink-muted">
          <WarningCircle size={16} />
          {t("error")}
        </div>
      ) : (
        <div className={cn("h-full w-full", loading !== false && "animate-pulse bg-surface-2")} aria-hidden />
      )}
      {/* The whole picture is one button; the frame under it never receives the click. */}
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("open", { name: label })}
          className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/0 to-transparent opacity-100 outline-none transition-colors hover:from-black/25 focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <span className="mb-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/thumb:opacity-100 group-focus-within/thumb:opacity-100">
            {t("preview")}
          </span>
        </button>
      ) : null}
      {badge ? <div className="pointer-events-none absolute left-2 top-2">{badge}</div> : null}
    </div>
  );
}

/** A template's thumbnail: what an English recipient gets now, with the default samples. */
export function TemplateThumbnail({
  templateKey,
  label,
  onOpen,
  height,
  badge,
}: {
  templateKey: string;
  label: string;
  onOpen?: () => void;
  height?: number;
  badge?: ReactNode;
}) {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const rendered = useRenderedEmail(templateKey, { locale: "en" }, seen);
  return (
    <div ref={ref}>
      <EmailThumbnailFrame
        html={rendered.data?.html}
        loading={!seen || rendered.isPending}
        error={rendered.isError}
        label={label}
        onOpen={onOpen}
        height={height}
        badge={badge}
      />
    </div>
  );
}

/** A layout's or block's thumbnail: the published version inside an email. */
export function BlockThumbnail({
  blockId,
  label,
  onOpen,
  height,
  badge,
}: {
  blockId: string;
  label: string;
  onOpen?: () => void;
  height?: number;
  badge?: ReactNode;
}) {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const rendered = useRenderedBlock(blockId, { locale: "en" }, seen);
  return (
    <div ref={ref}>
      <EmailThumbnailFrame
        html={rendered.data?.html}
        loading={!seen || rendered.isPending}
        error={rendered.isError}
        label={label}
        onOpen={onOpen}
        height={height}
        badge={badge}
      />
    </div>
  );
}
