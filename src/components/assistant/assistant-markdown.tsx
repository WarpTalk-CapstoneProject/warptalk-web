"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MeetingLinkCards } from "@/components/assistant/meeting-link-card";
import { stripMeetingMarkers } from "@/lib/assistant/meeting-links";

/**
 * What WarpBot's answers are rendered with, everywhere it speaks.
 *
 * WHY THIS EXISTS
 *     The assistant writes markdown — it is asked for headings, bullets and bold terms, and
 *     it obliges. Both places that displayed it printed the source text with
 *     `whitespace-pre-wrap`, so a reader got literal `**tiếng Việt**` and `## Action items`
 *     on screen. The line breaks survived; nothing else did.
 *
 * WHY A LIBRARY AND NOT A REGEX
 *     A hand-rolled renderer covering the cases in the bug report — `**bold**`, `-` lists —
 *     would have mangled the ones not in it. The model emits tables, numbered lists, fenced
 *     code and links too, and a partial parser turns those into something worse than the raw
 *     text it replaced. react-markdown does not render raw HTML unless a plugin is added to
 *     make it, so model output cannot inject markup into the page.
 *
 * WHY THE ELEMENTS ARE ALL OVERRIDDEN
 *     Default browser margins for h1-h3/ul/p are sized for documents. In a 13px chat column
 *     they blow the rhythm apart. Every element that can appear is given spacing that reads
 *     as chat rather than as an article.
 *
 * MEETING CARDS
 *     `withMeetingCards` draws a card under the answer for every meeting WarpBot created this
 *     turn, read from the markers the worker appended (see MeetingLinkCards). Opt-in, because
 *     this also renders documents, where nothing of the sort belongs.
 *
 *     The markers themselves are taken out of the text FIRST, always. react-markdown has no raw
 *     HTML plugin here, and instead of dropping an HTML comment it prints it: the reader saw
 *     `<!-- warpbot:meeting {"kind":"google_meet",…} -->` under the answer, in full.
 */
export function AssistantMarkdown({
  children,
  withMeetingCards = false,
  meetingCardsOpenRoomsOutside = false,
}: {
  children: string;
  withMeetingCards?: boolean;
  meetingCardsOpenRoomsOutside?: boolean;
}) {
  const prose = stripMeetingMarkers(children);

  return (
    <div className="space-y-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          // Colour is INHERITED, never set, on every element that carries prose.
          // WarpBot's messages are `text-primary` in the meeting chat panel and `text-ink`
          // in the global widget; a hardcoded colour here turned every bold phrase and
          // heading dark in the middle of an otherwise purple answer.
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => (
            <h1 className="mt-3 text-[14px] font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 text-[13px] font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 text-[13px] font-semibold">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-4 marker:text-ink-subtle">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-4 marker:text-ink-subtle">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ children, className }) =>
            // A fenced block arrives with a language class; inline code has none. They need
            // different shapes, and react-markdown routes both through this one component.
            className ? (
              <code className="block overflow-x-auto rounded-md bg-surface-2 p-2 font-mono text-[12px]">
                {children}
              </code>
            ) : (
              <code className="rounded bg-surface-2 px-1 py-px font-mono text-[12px]">
                {children}
              </code>
            ),
          pre: ({ children }) => <pre className="overflow-x-auto">{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-2.5 opacity-80">
              {children}
            </blockquote>
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
          // Wide tables must scroll inside the message, not stretch the chat column.
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border px-1.5 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-1.5 py-1 align-top">{children}</td>
          ),
          hr: () => <hr className="border-border" />,
        }}
      >
        {prose}
      </ReactMarkdown>
      {withMeetingCards ? (
        <MeetingLinkCards markdown={children} openRoomsOutside={meetingCardsOpenRoomsOutside} />
      ) : null}
    </div>
  );
}
