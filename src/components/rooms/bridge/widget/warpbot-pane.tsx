"use client";

/**
 * SLOT: the WarpBot tab of the Meet widget. Owner: WT-525 t5. Spec: WT-615 / WT-620.
 *
 * CONTRACT
 *   `export function WarpBotPane()` — no props; reads `roomId` and `room` from `useBridgeWidget()`.
 *   The shell renders it in a `relative flex min-h-0 flex-1 flex-col` panel between the tabs and
 *   the dock, and keeps it mounted (hidden) while the Transcript tab shows, so a half-typed
 *   question survives a switch. The pane owns its scroller and its composer.
 *
 * PRIVATE, 1-TO-1
 *   Only this user sees what is asked here. Nothing goes to the Google Meet chat, and nothing goes
 *   to the room's meeting chat either: the questions travel the global widget's assistant path, not
 *   the in-meeting `@WarpBot` path that posts into the room (see use-private-warpbot-thread.ts).
 *   The note at the top says so, because a box that looks like a chat next to a call reads as the
 *   call's chat until something on screen says otherwise.
 *
 * THE SAME AGENT, THE SAME LOOK
 *   Answers are the global widget's: unboxed markdown in ink, the source chips, and the work trail
 *   folded under every reply. The composer behaves like its composer — "Ask WarpBot...", Enter to
 *   send, Shift+Enter for a new line. scripts/check-warpbot-surface-parity.mjs holds this pane to
 *   the other two surfaces.
 *
 * WHAT THE WIDGET HAS THAT THIS DOES NOT, ON PURPOSE
 *   - @mentions, slash commands, the Tools popover, attachments and chat history. This is a 460px
 *     window floating over a call; the question is about the meeting, and the meeting is already
 *     attached. The conversation is an ordinary assistant conversation, so it is in the user's
 *     WarpBot history in the main window afterwards.
 *   - The plugin Connect / setup cards. Consent opens a browser from an always-on-top popup, and
 *     the desktop hand-back from it is not a finished path yet — a Connect button here would be a
 *     control that cannot succeed. The model's answer still says what is missing.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, LockSimple, NotePencil } from "@phosphor-icons/react/dist/ssr";

import { AnswerSources } from "@/components/assistant/answer-sources";
import { AssistantMarkdown } from "@/components/assistant/assistant-markdown";
import { AssistantWorkTrail } from "@/components/assistant/assistant-work-trail";
import { AssistantQuestionCard } from "@/components/layout/assistant-question-card";
import { LumidotSpinner } from "@/components/ui/lumidot-spinner";
import { ScrollFadeEdge, ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { useScrollToLatest } from "@/hooks/use-scroll-to-latest";
import { composerReadiness } from "@/lib/assistant/composer-readiness";
import { MAX_QUEUED_AGENT_ASKS } from "@/lib/meeting/assistant-queue";
import { cn } from "@/lib/utils";

import { usePrivateWarpBotThread } from "./warpbot/use-private-warpbot-thread";
import { useBridgeWidget } from "./widget-context";

/** Matches global-chatbot.tsx: within this many px of the bottom counts as "following along". */
const AUTOSCROLL_THRESHOLD_PX = 80;

/** Matches global-chatbot.tsx (WT-667): about six lines, then the composer scrolls instead. */
const COMPOSER_MAX_HEIGHT_PX = 132;

export function WarpBotPane() {
  const { roomId, room } = useBridgeWidget();
  const thread = usePrivateWarpBotThread({ roomId, room });
  const {
    messages,
    steps,
    isAiTyping,
    isSlow,
    queuedAsks,
    pendingQuestions,
    workspaceId,
  } = thread;

  const [inputValue, setInputValue] = useState("");
  /** Said under the composer when the queue is full; cleared as soon as the text changes. */
  const [refused, setRefused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // WT-541: one answer to "can this send", for the button and the hint alike.
  const composerState = composerReadiness({
    text: inputValue,
    attachmentCount: 0,
    activeWorkspaceId: workspaceId,
  });

  // WT-667, as in the widget: reset to `auto` before measuring, or the box can grow and never
  // shrink, because a tall textarea reports its own height as the height its content wants.
  const autoSizeComposer = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, []);
  // Sized on attach too, so a draft kept across a remount does not come back one line tall.
  const attachComposer = useCallback(
    (element: HTMLTextAreaElement | null) => {
      inputRef.current = element;
      autoSizeComposer(element);
    },
    [autoSizeComposer],
  );
  useEffect(() => {
    autoSizeComposer(inputRef.current);
  }, [inputValue, autoSizeComposer]);

  // Follow new content, but never pull a reader who scrolled up to re-read an answer back down.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, steps, isAiTyping, queuedAsks, pendingQuestions]);

  /**
   * Re-follow when the pane is SHOWN.
   *
   * The shell keeps this pane mounted and `hidden` while the Transcript tab is up. A hidden element
   * has no height, so every answer that streams in meanwhile "scrolls to the bottom" of nothing,
   * and the tab would open at the top of the thread. The panel goes from zero to its real height
   * when it is shown, which a ResizeObserver sees; a window resize is caught the same way.
   */
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (shouldAutoScrollRef.current) container.scrollTop = container.scrollHeight;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const { isAway, scrollToLatest } = useScrollToLatest(messagesContainerRef, {
    threshold: AUTOSCROLL_THRESHOLD_PX,
    revision: `${messages.length}:${steps.length}:${isAiTyping}:${queuedAsks.length}`,
  });

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < AUTOSCROLL_THRESHOLD_PX;
  };

  const submit = (override?: string) => {
    const outcome = thread.ask(override ?? inputValue);
    if (outcome === "refused") {
      setRefused(true);
      return;
    }
    if (outcome === "blocked") return;
    // Sent or held: either way it was accepted, and leaving it in the box reads as a failed send.
    if (override === undefined) setInputValue("");
    setRefused(false);
    shouldAutoScrollRef.current = true;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // An IME (Vietnamese Telex, Japanese, Chinese…) confirms its candidate with Enter. Sending on
    // that keystroke posts half a word and leaves the rest in the box.
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  const startOver = () => {
    thread.startOver();
    setRefused(false);
    shouldAutoScrollRef.current = true;
    inputRef.current?.focus();
  };

  const isEmpty =
    messages.length === 0 && steps.length === 0 && queuedAsks.length === 0 && !isAiTyping;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-1.5 text-[11px] leading-4 text-ink-subtle">
        <LockSimple size={12} weight="regular" className="shrink-0" aria-hidden="true" />
        <span>Only you see this conversation. Nothing is posted to the Google Meet chat.</span>
      </p>

      {/* Messages */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3"
        >
          {isEmpty ? (
            <p className="px-1 text-[13px] leading-relaxed text-ink-muted">
              Ask WarpBot about this meeting, or about anything in your workspace.
            </p>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] break-words text-[13px] leading-relaxed",
                  message.role === "user"
                    ? "whitespace-pre-wrap rounded-[12px] bg-surface-3 px-3.5 py-2 text-ink"
                    : message.failed
                      ? "whitespace-pre-wrap py-2 pl-1 text-destructive"
                      : "py-2 pl-1 text-ink",
                )}
              >
                {message.role === "assistant" && !message.failed ? (
                  <>
                    {/* Streams: chunks append to `content`, so this re-renders as it is written. */}
                    <AssistantMarkdown>{message.content}</AssistantMarkdown>
                    {/* No workspace slug on purpose. With one, a document chip is a Next link, and
                        in this window that navigates the floating popup itself to a full document
                        page, with no way back to the widget. Without it the chip is a label; web
                        chips still open outside. */}
                    <AnswerSources sources={message.sources ?? []} workspaceSlug={null} />
                    {/* Under EVERY answer, folded — the record of which tools it came through. */}
                    <AssistantWorkTrail
                      steps={message.steps ?? []}
                      running={false}
                      durationMs={message.durationMs}
                    />
                  </>
                ) : (
                  <>
                    {message.content}
                    {message.failed && message.steps?.length ? (
                      <AssistantWorkTrail
                        steps={message.steps}
                        running={false}
                        durationMs={message.durationMs}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ))}

          {steps.length > 0 ? (
            <div className="flex justify-start">
              <AssistantWorkTrail steps={steps} running slow={isSlow} className="ml-1 mr-2 flex-1" />
            </div>
          ) : null}

          {isSlow && steps.length === 0 ? (
            <p className="py-1 pl-1 text-[12px] text-ink-subtle">
              Still working — this one is taking a while.
            </p>
          ) : null}

          {isAiTyping && steps.length === 0 ? (
            <div className="flex items-center gap-2 py-2 pl-1 text-[13px] text-ink-subtle">
              <LumidotSpinner />
              <span>Thinking...</span>
            </div>
          ) : null}

          {/* Last in the thread: the questions belong to the turn that is still open. */}
          {pendingQuestions ? (
            <div className="pl-1">
              <AssistantQuestionCard
                questions={pendingQuestions}
                disabled={isAiTyping}
                onSubmit={(answer) => {
                  thread.dismissQuestions();
                  submit(answer);
                }}
              />
            </div>
          ) : null}

          {/* Held questions sit BELOW the open turn, not in the thread: an answer to the question
              in flight is appended when it starts, and would otherwise land under a question
              that was asked after it. Each moves into the thread when it is actually sent. */}
          {queuedAsks.map((entry) => (
            <div key={entry.id} className="flex flex-col items-end gap-1">
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[12px] bg-surface-3 px-3.5 py-2 text-[13px] leading-relaxed text-ink opacity-60">
                {entry.content}
              </div>
              <span className="pr-1 text-[11px] text-ink-subtle">Queued</span>
            </div>
          ))}
        </div>
        <ScrollFadeEdge visible={isAway} />
        <ScrollToLatestChip visible={isAway} onClick={scrollToLatest} />
      </div>

      {/* Composer — pinned above the dock. */}
      <div className="shrink-0 px-3 pb-2.5 pt-1">
        <div className="rounded-[10px] border border-border bg-surface-1">
          <textarea
            ref={attachComposer}
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              if (refused) setRefused(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask WarpBot..."
            aria-label="Ask WarpBot"
            rows={1}
            className="block w-full resize-none overflow-y-auto bg-transparent px-3 pb-1 pt-2.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle"
          />

          {composerState.blocker === "no-workspace" ? (
            <p className="px-3 pb-1 text-[11px] leading-4 text-ink-subtle">{composerState.hint}</p>
          ) : null}
          {refused ? (
            <p className="px-3 pb-1 text-[11px] leading-4 text-ink-subtle" role="status">
              WarpBot already has {MAX_QUEUED_AGENT_ASKS} questions waiting. Let it catch up before
              asking another.
            </p>
          ) : null}

          <div className="flex items-center justify-between px-1.5 pb-1.5">
            <button
              type="button"
              onClick={startOver}
              disabled={messages.length === 0 && queuedAsks.length === 0}
              aria-label="New chat"
              title="New chat"
              className="flex items-center justify-center size-7 rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <NotePencil size={14} weight="regular" />
            </button>
            <button
              type="button"
              aria-label="Send message"
              onClick={() => submit()}
              disabled={!composerState.canSend}
              title={composerState.hint ?? "Send message"}
              className="flex items-center justify-center size-[26px] rounded-full bg-ink text-surface-1 transition-colors hover:bg-ink-muted disabled:bg-surface-2 disabled:text-ink-muted disabled:opacity-50"
            >
              <ArrowUp weight="bold" size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
