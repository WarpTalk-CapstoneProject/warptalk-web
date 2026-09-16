"use client";

/**
 * The Meet widget's WarpBot conversation: one person, one assistant, nobody else. WT-525 t5.
 *
 * WHICH PATH, AND WHY NOT THE MEETING CHAT
 *   There are two ways to reach WarpBot. The in-meeting panel posts an `@WarpBot` mention into the
 *   room's meeting chat (MeetingChatService), so the question and the answer are messages every
 *   participant sees. The global widget talks to the assistant service instead: a conversation
 *   owned by one user, answered over AssistantHub, visible to nobody else. WT-620 wants the second
 *   — the popup is a private assistant, and Google Meet already has a chat for the room — so this
 *   is built on exactly what global-chatbot.tsx uses: `useCreateAssistantConversation`,
 *   `useSendAssistantMessage`, and `/api/v1/assistant/chat-hub` with the same events.
 *
 * WHY THIS IS A COPY OF THE WIDGET'S HUB HANDLING, NOT AN IMPORT
 *   global-chatbot.tsx keeps its stream handling inline in a 2000-line component, and it cannot be
 *   edited from this task. So the hooks and services underneath are shared and the ~200 lines that
 *   turn hub events into a thread are repeated here, event for event, in the same order and with the
 *   same comments' reasoning. Extracting both into one `useAssistantThread` is the follow-up; until
 *   then scripts/check-warpbot-surface-parity.mjs is what stops the two from drifting.
 *
 * WHAT THIS DOES THAT THE WIDGET DOES NOT
 *   - Holds a second question while the first is answered (WT-580, `decideAgentSend`). The assistant
 *     service builds each turn's history from COMPLETED rows, exactly like the meeting chat did, so a
 *     question sent mid-answer is answered against two user turns in a row. In a live call people
 *     fire follow-ups quickly, which is the case the queue was written for.
 *   - Folds the trail from a ref. The widget's completed handler reads `steps` from the closure of
 *     the effect that registered it — the render in which the conversation id arrived, when the
 *     trail was still empty — so the folded "Worked for …" line never has anything to fold.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  parseAssistantQuestions,
  type AssistantQuestion,
} from "@/components/layout/assistant-question-card";
import { useCreateAssistantConversation, useSendAssistantMessage } from "@/hooks/use-assistant";
import { parseAnswerSources, type AnswerSource } from "@/lib/assistant/answer-sources";
import { composerReadiness } from "@/lib/assistant/composer-readiness";
import { decideAgentSend } from "@/lib/meeting/assistant-queue";
import {
  REASONING_STEP,
  THINKING_STEP,
  WRITING_STEP,
  withStepDetail,
  type AssistantStep,
} from "@/lib/meeting/assistant-tool-labels";
import { createHubConnection } from "@/lib/realtime/signalr";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { TranslationRoomDto } from "@/types/translationRoom";

import { buildWidgetPageContext } from "./widget-page-context";

/**
 * Same values as global-chatbot.tsx, which does not export them. See the note there: the first
 * message of a conversation is posted only once this client is in the hub group, or its whole
 * answer streams past an unsubscribed client; and a turn with no hub traffic at all is reported as
 * slow rather than left on a spinner forever.
 */
const HUB_JOIN_TIMEOUT_MS = 10_000;
const ASSISTANT_RESPONSE_TIMEOUT_MS = 90_000;

export type PrivateWarpBotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
  /** On the message, not beside it — the same reason global-chatbot gives. */
  sources?: AnswerSource[];
  /** The finished trail, folded under the answer it produced. */
  steps?: AssistantStep[];
  durationMs?: number;
};

/** A question accepted while another is being answered. Not in the thread until it is sent. */
export type QueuedAsk = { id: string; content: string };

/**
 * What happened to a question the person just submitted, so the composer knows whether to clear.
 *
 * `refused` keeps the text in the box: the queue is full, and throwing away what somebody typed
 * is the thing the queue exists to avoid.
 */
export type AskOutcome = "sent" | "queued" | "refused" | "blocked";

const THINKING: AssistantStep = { key: THINKING_STEP, tool: THINKING_STEP, done: false };

export function usePrivateWarpBotThread({
  roomId,
  room,
}: {
  roomId: string;
  room: TranslationRoomDto | undefined;
}) {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  /**
   * The ROOM's workspace first.
   *
   * This window never passes through `[workspaceSlug]` routing, so `activeWorkspaceId` is whatever
   * the main window last persisted — not necessarily the workspace this meeting belongs to. It
   * matters twice: .NET drops a page context whose workspace differs from the conversation's, and
   * every tool the model calls is scoped to the conversation's workspace. The stored one is only a
   * fallback for a room that has not loaded.
   */
  const workspaceId = room?.workspaceId ?? activeWorkspaceId ?? null;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PrivateWarpBotMessage[]>([]);
  const [steps, setSteps] = useState<AssistantStep[]>([]);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  /** A question is out and its answer has not finished — the WT-580 "busy". */
  const [turnOpen, setTurnOpen] = useState(false);
  const [queuedAsks, setQueuedAsks] = useState<QueuedAsk[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<AssistantQuestion[] | null>(null);

  // Refs for everything a hub handler or a queued dispatch reads. Both run long after the render
  // that created them, and reading state there is exactly how the widget's trail went missing.
  const conversationIdRef = useRef<string | null>(null);
  /** The workspace the conversation was CREATED in; its page context must say the same one. */
  const conversationWorkspaceRef = useRef<string | null>(null);
  const stepsRef = useRef<AssistantStep[]>([]);
  const turnOpenRef = useRef(false);
  const queueRef = useRef<QueuedAsk[]>([]);
  const turnStartedAtRef = useRef<number | null>(null);
  const joinedConversationIdRef = useRef<string | null>(null);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped by `startOver`, so a send still in flight from the old thread cannot write into the new one. */
  const generationRef = useRef(0);
  const localIdRef = useRef(0);
  const dispatchRef = useRef<((ask: QueuedAsk) => Promise<void>) | null>(null);

  const createConversation = useCreateAssistantConversation();
  const sendAssistantMessage = useSendAssistantMessage();

  const updateSteps = useCallback((next: (current: AssistantStep[]) => AssistantStep[]) => {
    const value = next(stepsRef.current);
    stepsRef.current = value;
    setSteps(value);
  }, []);

  const clearResponseTimeout = useCallback(() => {
    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }
  }, []);

  const armResponseTimeout = useCallback(() => {
    clearResponseTimeout();
    responseTimeoutRef.current = setTimeout(() => {
      responseTimeoutRef.current = null;
      // Slow, not failed: the deadline is a clock, not a signal from the worker.
      setIsSlow(true);
    }, ASSISTANT_RESPONSE_TIMEOUT_MS);
  }, [clearResponseTimeout]);

  useEffect(() => clearResponseTimeout, [clearResponseTimeout]);

  /**
   * The answer is over, one way or another: release the turn and send the next held question.
   *
   * Driven from the events that end a turn rather than from an effect watching `turnOpen`, so the
   * next question goes out in the same tick the previous answer landed and there is no render in
   * which two could both see the assistant as idle.
   */
  const endTurn = useCallback(() => {
    turnOpenRef.current = false;
    setTurnOpen(false);
    const [next, ...rest] = queueRef.current;
    if (!next) return;
    queueRef.current = rest;
    setQueuedAsks(rest);
    void dispatchRef.current?.(next);
  }, []);

  const waitForConversationJoin = useCallback(async (convId: string) => {
    const deadline = Date.now() + HUB_JOIN_TIMEOUT_MS;
    while (joinedConversationIdRef.current !== convId) {
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return true;
  }, []);

  // ── the stream — global-chatbot.tsx's hub effect, event for event ─────────────
  useEffect(() => {
    if (!conversationId) return;

    const connection = createHubConnection("/api/v1/assistant/chat-hub");
    // The ref half matters after `startOver`: until this effect's cleanup stops the old connection,
    // it can still deliver events for a thread the person has already cleared.
    const mine = (payload: { conversationId: string }) =>
      payload.conversationId === conversationId && conversationIdRef.current === conversationId;

    const upsertAssistantMessage = (
      messageId: string,
      updater: (prev: PrivateWarpBotMessage | undefined) => PrivateWarpBotMessage,
    ) => {
      setMessages((prev) => {
        const index = prev.findIndex((message) => message.id === messageId);
        if (index === -1) return [...prev, updater(undefined)];
        const next = [...prev];
        next[index] = updater(next[index]);
        return next;
      });
    };

    connection.on(
      "AssistantMessageStarted",
      (payload: { conversationId: string; messageId: string }) => {
        if (!mine(payload)) return;
        setIsAiTyping(true);
        setIsSlow(false);
        // The send already opened the trail on "reading your question"; only seed it if something
        // cleared it in between, so a tool step that raced ahead of this event is not wiped.
        if (stepsRef.current.length === 0) updateSteps(() => [THINKING]);
        if (turnStartedAtRef.current === null) turnStartedAtRef.current = Date.now();
        armResponseTimeout();
        upsertAssistantMessage(payload.messageId, (prev) => ({
          id: payload.messageId,
          role: "assistant",
          content: prev?.content ?? "",
        }));
      },
    );

    connection.on(
      "AssistantMessageChunk",
      (payload: { conversationId: string; messageId: string; delta: string }) => {
        if (!mine(payload)) return;
        setIsAiTyping(false);
        setIsSlow(false);
        // Settled, not discarded, and writing named as a step of its own — see global-chatbot.
        updateSteps((current) => {
          const settled = current.map((step) => ({ ...step, done: true }));
          return settled.some((step) => step.tool === WRITING_STEP)
            ? settled
            : [...settled, { key: WRITING_STEP, tool: WRITING_STEP, done: false }];
        });
        armResponseTimeout();
        upsertAssistantMessage(payload.messageId, (prev) => ({
          id: payload.messageId,
          role: "assistant",
          content: (prev?.content ?? "") + payload.delta,
        }));
      },
    );

    connection.on(
      "AssistantToolCallStarted",
      (payload: { conversationId: string; toolName: string; toolDetail?: string }) => {
        if (!mine(payload)) return;
        setIsAiTyping(true);
        updateSteps((current) => [
          ...current.map((step) => ({ ...step, done: true })),
          {
            key: `${payload.toolName}-${current.length}`,
            tool: payload.toolName,
            done: false,
            detail: payload.toolDetail || undefined,
          },
        ]);
        armResponseTimeout();
      },
    );

    connection.on(
      "AssistantReasoning",
      (payload: { conversationId: string; title?: string; body?: string }) => {
        if (!mine(payload)) return;
        const title = payload.title?.trim() ?? "";
        const body = payload.body?.trim() ?? "";
        if (!title && !body) return;
        setIsAiTyping(true);
        updateSteps((current) => [
          ...current.map((step) => ({ ...step, done: true })),
          {
            key: `${REASONING_STEP}-${current.length}`,
            tool: REASONING_STEP,
            done: false,
            detail: title || undefined,
            body: body || undefined,
          },
        ]);
        armResponseTimeout();
      },
    );

    connection.on(
      "AssistantQuestion",
      (payload: { conversationId: string; questionsJson: string }) => {
        if (!mine(payload)) return;
        // Only the question card. The plugin Connect / setup cards the widget also draws from this
        // payload are left out of the popup on purpose — see warpbot-pane.tsx.
        const questions = parseAssistantQuestions(payload.questionsJson);
        if (questions.length) setPendingQuestions(questions);
        armResponseTimeout();
      },
    );

    connection.on(
      "AssistantToolCallCompleted",
      (payload: { conversationId: string; toolName?: string; toolDetail?: string }) => {
        if (!mine(payload)) return;
        updateSteps((current) =>
          withStepDetail(current, payload.toolName ?? "", payload.toolDetail).map((step) => ({
            ...step,
            done: true,
          })),
        );
        armResponseTimeout();
      },
    );

    connection.on(
      "AssistantMessageCompleted",
      (payload: {
        conversationId: string;
        id: string;
        content: string;
        sourcesJson?: string | null;
      }) => {
        if (!mine(payload)) return;
        setIsAiTyping(false);
        setIsSlow(false);
        clearResponseTimeout();

        // From the REF. See the header: the closure's copy is the empty trail of an earlier render.
        const finishedSteps = stepsRef.current.map((step) => ({ ...step, done: true }));
        const startedAt = turnStartedAtRef.current;
        turnStartedAtRef.current = null;
        updateSteps(() => []);

        upsertAssistantMessage(payload.id, () => ({
          id: payload.id,
          role: "assistant",
          content: payload.content,
          sources: parseAnswerSources(payload.sourcesJson),
          steps: finishedSteps.length > 0 ? finishedSteps : undefined,
          durationMs: startedAt ? Date.now() - startedAt : undefined,
        }));
        endTurn();
      },
    );

    connection.on(
      "AssistantMessageFailed",
      (payload: { conversationId: string; messageId: string; error: string }) => {
        if (!mine(payload)) return;
        setIsAiTyping(false);
        setIsSlow(false);
        clearResponseTimeout();
        // How far it got is the only clue to why, so a failure keeps its trail too.
        const failedSteps = stepsRef.current.map((step) => ({ ...step, done: true }));
        const startedAt = turnStartedAtRef.current;
        turnStartedAtRef.current = null;
        updateSteps(() => []);
        upsertAssistantMessage(payload.messageId, () => ({
          id: payload.messageId,
          role: "assistant",
          content: payload.error,
          failed: true,
          steps: failedSteps.length > 0 ? failedSteps : undefined,
          durationMs: startedAt ? Date.now() - startedAt : undefined,
        }));
        endTurn();
      },
    );

    connection.on(
      "AssistantFollowUpMessage",
      (payload: {
        conversationId: string;
        id: string;
        content: string;
        sourcesJson?: string | null;
      }) => {
        if (!mine(payload)) return;
        setMessages((prev) => [
          ...prev,
          {
            id: payload.id,
            role: "assistant",
            content: payload.content,
            sources: parseAnswerSources(payload.sourcesJson),
          },
        ]);
      },
    );

    const joinConversation = async () => {
      await connection.invoke("JoinConversation", conversationId);
      joinedConversationIdRef.current = conversationId;
    };

    // A reconnect restores the socket, not the group membership — re-join, or every token of the
    // next answer goes to a client that is no longer listening.
    connection.onreconnecting(() => {
      joinedConversationIdRef.current = null;
    });
    connection.onreconnected(() => {
      joinedConversationIdRef.current = null;
      void joinConversation().catch(() => {
        // Still unjoined; the response watchdog says so.
      });
    });
    connection.onclose(() => {
      joinedConversationIdRef.current = null;
    });

    connection
      .start()
      .then(joinConversation)
      .catch(() => {
        // The send's join wait times out and the watchdog reports the turn as slow.
      });

    return () => {
      joinedConversationIdRef.current = null;
      void connection.stop();
    };
  }, [conversationId, armResponseTimeout, clearResponseTimeout, updateSteps, endTurn]);

  // ── sending ──────────────────────────────────────────────────────────────────

  /** Actually send one question. Separate from `ask`, because a held question is sent from `endTurn`. */
  const dispatch = async (entry: QueuedAsk) => {
    const generation = generationRef.current;
    turnOpenRef.current = true;
    setTurnOpen(true);
    setMessages((prev) => [...prev, { id: entry.id, role: "user", content: entry.content }]);
    setPendingQuestions(null);
    setIsAiTyping(true);
    setIsSlow(false);
    // The turn OPENS on a step, as the in-meeting panel's beginAssistantTurn does: the stretch
    // before the first hub event is the longest part of a slow turn, and a bare spinner there says
    // less than the widget's trail does.
    turnStartedAtRef.current = Date.now();
    updateSteps(() => [THINKING]);
    armResponseTimeout();

    const fail = (content: string) => {
      if (generationRef.current !== generation) return;
      clearResponseTimeout();
      setIsAiTyping(false);
      setIsSlow(false);
      turnStartedAtRef.current = null;
      updateSteps(() => []);
      setMessages((prev) => [
        ...prev,
        { id: `failed-${entry.id}`, role: "assistant", content, failed: true },
      ]);
      endTurn();
    };

    if (!workspaceId) {
      fail("WarpBot answers about one workspace. Open a workspace to start a conversation.");
      return;
    }

    let convId = conversationIdRef.current;
    if (!convId) {
      try {
        const conversation = await createConversation.mutateAsync(workspaceId);
        if (generationRef.current !== generation) return;
        convId = conversation.id;
        conversationIdRef.current = convId;
        conversationWorkspaceRef.current = workspaceId;
        setConversationId(convId);
      } catch {
        fail("Couldn't start a conversation with WarpBot. Please try again.");
        return;
      }
    }

    try {
      await waitForConversationJoin(convId);
      if (generationRef.current !== generation) return;
      await sendAssistantMessage.mutateAsync({
        conversationId: convId,
        content: entry.content,
        // The room rides along on every turn, as the widget's ambient context does. No meeting
        // chat, no transcript text: the model reads the transcript itself through get_transcript.
        pageContext: buildWidgetPageContext({
          roomId,
          room,
          workspaceId: conversationWorkspaceRef.current ?? workspaceId,
        }),
      });
      // The answer streams in over the hub — see the effect above.
    } catch {
      fail("That message couldn't be sent. Please try again.");
    }
  };

  // The held question is sent by `endTurn`, from a hub handler registered renders ago; it has to
  // reach the dispatch of the LATEST render, or it would send with the room as it was back then.
  useEffect(() => {
    dispatchRef.current = dispatch;
  });

  const ask = (raw: string): AskOutcome => {
    const content = raw.trim();
    const readiness = composerReadiness({
      text: content,
      attachmentCount: 0,
      activeWorkspaceId: workspaceId,
    });
    if (!readiness.canSend) return "blocked";

    localIdRef.current += 1;
    const entry: QueuedAsk = { id: `local-${Date.now()}-${localIdRef.current}`, content };

    // Every message here addresses WarpBot, so this is the in-meeting rule with the human branch
    // never taken: send when idle, hold while busy, refuse past MAX_QUEUED_AGENT_ASKS.
    const decision = decideAgentSend({
      asksTheAgent: true,
      assistantBusy: turnOpenRef.current,
      queueLength: queueRef.current.length,
    });
    if (decision === "refuse") return "refused";
    if (decision === "queue") {
      queueRef.current = [...queueRef.current, entry];
      setQueuedAsks(queueRef.current);
      return "queued";
    }
    void dispatch(entry);
    return "sent";
  };

  /**
   * A fresh conversation. Also the way out of a turn that never comes back: the queue waits on the
   * answer in flight, and a hub that died mid-turn would otherwise hold every later question.
   */
  const startOver = useCallback(() => {
    generationRef.current += 1;
    clearResponseTimeout();
    conversationIdRef.current = null;
    conversationWorkspaceRef.current = null;
    setConversationId(null);
    setMessages([]);
    updateSteps(() => []);
    setIsAiTyping(false);
    setIsSlow(false);
    setPendingQuestions(null);
    turnStartedAtRef.current = null;
    turnOpenRef.current = false;
    setTurnOpen(false);
    queueRef.current = [];
    setQueuedAsks([]);
  }, [clearResponseTimeout, updateSteps]);

  return {
    workspaceId,
    messages,
    steps,
    isAiTyping,
    isSlow,
    turnOpen,
    queuedAsks,
    pendingQuestions,
    dismissQuestions: () => setPendingQuestions(null),
    ask,
    startOver,
  };
}
