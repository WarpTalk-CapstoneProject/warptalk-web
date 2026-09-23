"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Markdown for the meeting's written record — the summary on the recap rail and the previews on
 * the /artifacts cards.
 *
 * Same library and the same safety property as AssistantMarkdown (react-markdown renders no raw
 * HTML unless a plugin is added to make it), with element styles sized for the record rather than
 * for a chat bubble. Three shapes, because the record is shown in three kinds of place:
 *
 *   SummaryMarkdown  a block of prose that may carry headings and lists — the summary's overview.
 *                    WT-697: the backend first stores an untemplated FALLBACK summary whose
 *                    `summary` is raw model markdown (`## Meeting Summary`, `- **Purpose:** …`)
 *                    and upgrades it later. The rail printed that string into a <p>, so the reader
 *                    saw the markup until a reload happened to land on the upgraded row.
 *   InlineMarkdown   one sentence inside a control (a cited claim). Paragraphs are unwrapped so a
 *                    `**term**` renders bold without putting a block element inside a <button>.
 *   PreviewMarkdown  a card thumbnail. Tiny, clamped by its container, and NON-INTERACTIVE: the
 *                    card is itself a link, so a link inside it would be an <a> inside an <a>.
 *
 * Colour is inherited everywhere, never set, so each caller's text colour carries through.
 */

const inlineOnly: Components = {
  p: ({ children }) => <>{children}</>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-surface-2 px-1 py-px font-mono text-[0.92em]">{children}</code>
  ),
  // A claim is already a control; a nested link would steal its click.
  a: ({ children }) => <span className="underline underline-offset-2">{children}</span>,
  img: () => null,
};

export function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // Anything block-level in a one-line claim is unwrapped to its text rather than dropped.
      allowedElements={["p", "strong", "em", "code", "a", "del", "br"]}
      unwrapDisallowed
      components={inlineOnly}
    >
      {children}
    </ReactMarkdown>
  );
}

export function SummaryMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <h4 className="mt-3 text-[13px] font-semibold">{children}</h4>,
          h2: ({ children }) => <h4 className="mt-3 text-[13px] font-semibold">{children}</h4>,
          h3: ({ children }) => <h5 className="mt-2.5 text-[12.5px] font-semibold">{children}</h5>,
          h4: ({ children }) => <h5 className="mt-2.5 text-[12.5px] font-semibold">{children}</h5>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-4 marker:text-ink-subtle">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-4 marker:text-ink-subtle">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-surface-2 px-1 py-px font-mono text-[0.92em]">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-2.5 opacity-80">{children}</blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="border-border" />,
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function PreviewMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      // `pointer-events-none`: the thumbnail is a picture of the document inside a link, and every
      // click on it belongs to that link.
      className={cn(
        "pointer-events-none space-y-1 break-words [&>*:first-child]:mt-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h2: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h3: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h4: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h5: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h6: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-0.5 pl-3">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-0.5 pl-3">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ children }) => <code className="font-mono">{children}</code>,
          pre: ({ children }) => <>{children}</>,
          // Text, not a link: the card is the link.
          a: ({ children }) => <span className="underline underline-offset-1">{children}</span>,
          blockquote: ({ children }) => <div className="opacity-80">{children}</div>,
          hr: () => null,
          img: () => null,
          table: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
