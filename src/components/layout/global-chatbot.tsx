"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  ClockCounterClockwise,
  ArrowsOutSimple,
  CornersIn,
  Plus,
  PaperPlaneTilt,
  Cube,
  CaretDown,
  Paperclip,
  FileText,
  BookBookmark,
  VideoCamera,
  X,
} from "@phosphor-icons/react/dist/ssr";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import {
  assistantToolDoneLabel,
  assistantToolLabel,
  withStepDetail,
  REASONING_STEP,
  THINKING_STEP,
  WRITING_STEP,
  type AssistantStep,
} from "@/lib/meeting/assistant-tool-labels";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { composerReadiness } from "@/lib/assistant/composer-readiness";
import { useAssistantContextStore } from "@/stores/assistant-context-store";
import {
  useWorkspaceMembers,
  useWorkspaceDocuments,
} from "@/hooks/use-workspace";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import {
  useAssistantConversations,
  useAssistantSkills,
  useCreateAssistantConversation,
  useLoadAssistantConversation,
  useSendAssistantMessage,
} from "@/hooks/use-assistant";
import { createHubConnection } from "@/lib/realtime/signalr";
import type * as signalR from "@microsoft/signalr";
import type {
  AssistantConversationDto,
  AssistantMentionDto,
  AssistantPageContextDto,
} from "@/types/assistant";
import {
  AssistantQuestionCard,
  parseAssistantQuestions,
  type AssistantQuestion,
} from "@/components/layout/assistant-question-card";
import { AssistantMarkdown } from "@/components/assistant/assistant-markdown";
import { AnswerSources } from "@/components/assistant/answer-sources";
import { AssistantWorkTrail } from "@/components/assistant/assistant-work-trail";
import {
  parseAnswerSources,
  type AnswerSource,
} from "@/lib/assistant/answer-sources";
import { LumidotSpinner } from "@/components/ui/lumidot-spinner";

import { ScrollFadeEdge, ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { useScrollToLatest } from "@/hooks/use-scroll-to-latest";

import { useAssistantWidgetStore } from "@/stores/assistant-widget-store";
import { toast } from "sonner";

import { ChatAttachmentStrip } from "@/components/layout/chat-attachment-strip";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
  rejectionReason,
  toAttachment,
  type ChatAttachment,
} from "@/lib/assistant/attachments";

/**
 * A row in the "@" menu. Every option must map to a real backend entity: the send path
 * only forwards mentions that carry both entityType and entityId (see sendMessage), so a
 * decorative option would render a chip, clear like a real mention, and scope nothing.
 * That is exactly what the old "Current meeting context"/"All Transcripts"/"Terminology"
 * rows did — the page the widget was opened from already rides along as ambient context.
 */
interface AssistantContextOption {
  id: string;
  title: string;
  type: string;
  icon: ReactNode;
  description: string;
  isAvatar?: boolean;
  entityType: AssistantMentionDto["entityType"];
  entityId: string;
}

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  context?: string;
  failed?: boolean;
  /**
   * What this answer cited. Held on the message rather than in a lookup beside it, so it
   * survives every path a message arrives by — streamed, completed, or replayed out of
   * history — and cannot end up under the wrong bubble.
   */
  sources?: AnswerSource[];
  /**
   * What WarpBot did to produce this answer, and how long it took.
   *
   * Kept on the message for the same reason `sources` is: it belongs to the answer, and holding
   * it in a lookup beside the thread would put it under the wrong bubble the first time two turns
   * overlapped. Absent on anything replayed out of history — the server stores no trail, and an
   * invented duration is a number a person can check and find wrong.
   */
  steps?: AssistantStep[];
  durationMs?: number;
}


interface SlashCommand {
  command: string;
  label: string;
  description: string;
  /** Ambient pageTypes (see assistant-context-store) this command is offered on. */
  pageTypes: string[];
  /** Builds the message text to send, given the current ambient page context. */
  buildPrompt: (context: AssistantPageContextDto | null) => string;
  /** If true, selecting the command sends immediately instead of just inserting text. */
  autoSend?: boolean;
}

// Each command leans on the ambient page-context system message the backend already
// injects (see chat_worker.py::_format_page_context) — entity_id is in there, so the
// prompt just has to unambiguously name the current entity and the model's own
// tool-calling picks the right id. The frontend never calls tools directly.
const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/summarize",
    label: "Summarize this meeting",
    description: "Summarize this meeting based on its transcript",
    pageTypes: ["room_detail", "in_meeting", "history"],
    autoSend: true,
    buildPrompt: () => "Summarize this meeting based on its transcript.",
  },
  {
    command: "/action-items",
    label: "Action items",
    description: "List action items and decisions from this meeting",
    pageTypes: ["room_detail", "in_meeting", "history"],
    autoSend: true,
    buildPrompt: () =>
      "List the action items and key decisions from this meeting's transcript.",
  },
  {
    command: "/room-info",
    label: "Room info",
    description: "Get this room's status, languages, and host",
    pageTypes: ["room_detail", "in_meeting", "history"],
    autoSend: true,
    buildPrompt: () => "Tell me this room's status, languages, and host.",
  },
  {
    command: "/summarize-doc",
    label: "Summarize this document",
    description: "Summarize the document you're viewing",
    pageTypes: ["document_detail"],
    autoSend: true,
    buildPrompt: () => "Summarize this document.",
  },
  {
    command: "/extract-terms",
    label: "Extract key terms",
    description: "Pull out key terms and terminology from this document",
    pageTypes: ["document_detail"],
    autoSend: true,
    buildPrompt: () =>
      "Extract the key terms and terminology used in this document.",
  },
  {
    command: "/recent-meetings",
    label: "Recent meetings",
    description: "List your recent meetings",
    pageTypes: ["history", "documents"],
    autoSend: true,
    buildPrompt: () => "List my recent meetings.",
  },
  {
    command: "/search-docs",
    label: "Search documents",
    description: "Search the workspace's documents — keep typing your query",
    pageTypes: ["documents"],
    autoSend: false,
    buildPrompt: () => "Search the workspace's documents for: ",
  },
];

const PAGE_CONTEXT_LABELS: Record<string, string> = {
  room_detail: "Meeting",
  in_meeting: "Live meeting",
  document_detail: "Document",
  documents: "Documents",
  // The `history` pageType is registered by the meeting-documents grid, and only ever with a
  // document open — so the chip names one meeting's record, not the archive.
  history: "Meeting record",
};

const PAGE_CONTEXT_ICONS: Record<string, ReactNode> = {
  room_detail: <VideoCamera size={15} weight="regular" />,
  in_meeting: <VideoCamera size={15} weight="regular" />,
  document_detail: <FileText size={15} weight="regular" />,
  documents: <FileText size={15} weight="regular" />,
  history: <ClockCounterClockwise size={15} weight="regular" />,
};

function getAmbientContextDisplay(context: AssistantPageContextDto | null) {
  if (!context) return null;

  const pageLabel = PAGE_CONTEXT_LABELS[context.pageType] ?? "Page";
  const rawTitle =
    context.snapshot?.title ||
    context.snapshot?.name ||
    context.snapshot?.query ||
    pageLabel;
  const title = rawTitle.trim() || pageLabel;

  return {
    pageLabel,
    title,
    status: context.snapshot?.status,
    icon: PAGE_CONTEXT_ICONS[context.pageType] ?? (
      <BookBookmark size={15} weight="regular" />
    ),
  };
}

/**
 * How long sendMessage waits for this client to actually be inside the conversation's hub
 * group before POSTing. The hub effect only starts negotiating once conversationId lands in
 * state, so without this wait the *first* message of every conversation is posted before the
 * client has joined — and every streamed token for it is delivered to nobody.
 */
const HUB_JOIN_TIMEOUT_MS = 10_000;

/**
 * Watchdog for a turn that produces no hub traffic at all (connection never came back,
 * worker died). A visible error beats a "Thinking..." spinner that runs until the tab is
 * closed — this is the fallback, the re-join above is the actual fix.
 */
const ASSISTANT_RESPONSE_TIMEOUT_MS = 90_000;

/** Matches chat-panel.tsx: within this many px of the bottom counts as "following along". */
const AUTOSCROLL_THRESHOLD_PX = 80;

/* WT-474: the caps, the accepted types and the File -> data-URL conversion all live in
   @/lib/assistant/attachments, so the paste handler, the file picker and the drop target cannot
   drift apart on what is acceptable. */

function formatConversationTimestamp(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPageContextKey(context: AssistantPageContextDto | null) {
  if (!context) return null;
  return [
    context.pageType,
    context.workspaceId ?? "",
    context.entityId ?? "",
  ].join(":");
}

export function GlobalChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  /** WT-474: attachments for the NEXT message only — cleared on send, like @mentions. */
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  /** Drag depth, not a boolean: dragging over a child fires dragleave on the parent. */
  const [dragDepth, setDragDepth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedContexts, setSelectedContexts] = useState<
    AssistantContextOption[]
  >([]);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [disabledPageContextKey, setDisabledPageContextKey] = useState<
    string | null
  >(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const activeWorkspaceSlug = useWorkspaceStore(
    (state) => state.activeWorkspaceSlug,
  );
  // WT-541: one answer to "can this send", shared by the button and by sendMessage.
  const composerState = composerReadiness({
    text: inputValue,
    attachmentCount: attachments.length,
    activeWorkspaceId,
  });
  const ambientPageContext = useAssistantContextStore(
    (state) => state.pageContext,
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAiTyping, setIsAiTyping] = useState(false);
  /**
   * The tools WarpBot reached for this turn, in order, kept until the next question.
   *
   * This used to be one string that every other event cleared: a chunk arriving set it back to
   * null, and so did each tool finishing. The steps were published correctly by the worker and
   * relayed correctly by the backend — they were simply overwritten faster than a person could
   * read them, so the widget looked like it only ever said "Thinking...". Keeping the trail is
   * the whole point: somebody wants to see that it checked the knowledge base AND searched
   * documents, not to catch one label mid-flash.
   */
  const [steps, setSteps] = useState<AssistantStep[]>([]);
  /** When the open turn began, so the folded summary can say how long it took. */
  const turnStartedAtRef = useRef<number | null>(null);
  /**
   * The turn has run past the watchdog and is still going.
   *
   * It used to append a message saying "WarpBot didn't answer in time" with failed: true, which
   * is a claim the widget was in no position to make: the deadline is a clock, not a signal from
   * the worker, and the answer usually arrived seconds later. The claim then STAYED in the
   * thread, in red, above the answer that disproved it.
   *
   * A model thinking for longer than expected is not a failure, so this says only that, and any
   * chunk, completion or failure clears it.
   */
  const [isSlow, setIsSlow] = useState(false);
  // The card WarpBot last put up, or null. One at a time: a second question set replaces the
  // first, because answering a stale card would send answers the assistant has moved past.
  const [pendingQuestions, setPendingQuestions] = useState<AssistantQuestion[] | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  /**
   * A question handed over from somewhere else on the page — today, the "Research this term"
   * action on a transcript hint.
   *
   * It is put in the box rather than sent. The person asked to look something up, not to have
   * a question asked on their behalf; leaving it editable is the difference between a shortcut
   * and the widget speaking for them.
   */
  const pendingPrompt = useAssistantWidgetStore((state) => state.pendingPrompt);
  const consumePendingPrompt = useAssistantWidgetStore((state) => state.consumePendingPrompt);
  useEffect(() => {
    if (!pendingPrompt) return;
    const prompt = consumePendingPrompt();
    if (!prompt) return;
    setInputValue(prompt);
    setIsMinimized(false);
    setIsOpen(true);
  }, [pendingPrompt, consumePendingPrompt]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("New chat");

  const createConversation = useCreateAssistantConversation();
  const sendAssistantMessage = useSendAssistantMessage();
  const loadConversation = useLoadAssistantConversation();
  const { data: skills } = useAssistantSkills();
  const [skillsMenuOpen, setSkillsMenuOpen] = useState(false);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);

  // Only fetch the conversation list while the history menu is actually open.
  const conversationsQuery = useAssistantConversations(
    historyMenuOpen ? activeWorkspaceId : null,
  );
  const visibleConversations = (conversationsQuery.data ?? []).filter(
    (conversation) => !conversation.isArchived,
  );

  /** Conversation id this client is currently *joined to* on the hub, not merely talking about. */
  const joinedConversationIdRef = useRef<string | null>(null);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setIsSlow(true);
    }, ASSISTANT_RESPONSE_TIMEOUT_MS);
  }, [clearResponseTimeout]);

  useEffect(() => clearResponseTimeout, [clearResponseTimeout]);

  /**
   * Resolves once the hub effect has confirmed JoinConversation for this id. Returns false on
   * timeout, in which case the caller still posts — a message that maybe streams beats a
   * message that is silently dropped, and the response watchdog covers the bad case.
   */
  const waitForConversationJoin = useCallback(async (convId: string) => {
    const deadline = Date.now() + HUB_JOIN_TIMEOUT_MS;
    while (joinedConversationIdRef.current !== convId) {
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return true;
  }, []);

  const startNewConversation = () => {
    clearResponseTimeout();
    setConversationId(null);
    setConversationTitle("New chat");
    setMessages([]);
    setInputValue("");
    setSelectedContexts([]);
    setIsAiTyping(false);
    setSteps([]);
    setIsSlow(false);
    setIsMinimized(false);
    shouldAutoScrollRef.current = true;
  };

  const openConversationFromHistory = async (
    conversation: AssistantConversationDto,
  ) => {
    try {
      const detail = await loadConversation.mutateAsync(conversation.id);
      clearResponseTimeout();
      setMessages(
        detail.messages
          .filter(
            (message) =>
              message.role === "user" || message.role === "assistant",
          )
          .map((message) => ({
            id: message.id,
            role: message.role as ChatRole,
            content: message.content,
            failed: message.status === "failed",
            sources: parseAnswerSources(message.sourcesJson),
          })),
      );
      setConversationTitle(detail.title?.trim() || "Chat history");
      setConversationId(detail.id);
      setIsAiTyping(false);
      setSteps([]);
      setIsSlow(false);
      setInputValue("");
      setSelectedContexts([]);
      setIsMinimized(false);
      setHistoryMenuOpen(false);
      shouldAutoScrollRef.current = true;
      setIsOpen(true);
    } catch {
      toast.error("Could not open that conversation.");
    }
  };

  // Real workspace members/meetings/documents for the @mention picker — each refetches
  // as the user types after "@". Selecting one attaches a real entityId that rides along
  // with the next sent message as a structured mention (see sendMessage below), not just
  // a display chip.
  const { data: memberResults } = useWorkspaceMembers(
    activeWorkspaceId ?? undefined,
    1,
    5,
    mentionQuery,
  );
  const { data: roomResults } = useTranslationRooms({
    search: mentionQuery,
    pageSize: 5,
  });
  const { data: documentResults } = useWorkspaceDocuments(
    activeWorkspaceId ?? "",
    1,
    5,
    mentionQuery,
  );
  const CONTEXT_OPTIONS: AssistantContextOption[] = useMemo(() => {
    const memberOptions: AssistantContextOption[] = (
      memberResults?.items ?? []
    ).map((m) => ({
      id: `member-${m.userId}`,
      title: m.fullName,
      type: "Members",
      icon: (m.fullName || "?").slice(0, 1).toUpperCase(),
      isAvatar: true,
      description: m.email,
      entityType: "member",
      entityId: m.userId,
    }));
    const roomOptions: AssistantContextOption[] = (
      roomResults?.rooms ?? []
    ).map((r) => ({
      id: `room-${r.id}`,
      title: r.title,
      type: "Meetings",
      icon: <VideoCamera size={14} />,
      description: r.status,
      entityType: "room",
      entityId: r.id,
    }));
    const documentOptions: AssistantContextOption[] = (
      documentResults?.items ?? []
    ).map((d) => ({
      id: `document-${d.id}`,
      title: d.name,
      type: "Documents",
      icon: <FileText size={14} />,
      description: d.status,
      entityType: "document",
      entityId: d.id,
    }));
    return [...memberOptions, ...roomOptions, ...documentOptions];
  }, [memberResults, roomResults, documentResults]);

  // Only offer commands relevant to the page the widget was opened from — e.g. "/summarize"
  // only makes sense with a room in ambient context (see chat_worker.py's page-context
  // injection). No ambient context registered on this page ⇒ no commands to offer.
  const ambientPageContextKey = useMemo(
    () => getPageContextKey(ambientPageContext),
    [ambientPageContext],
  );
  const effectivePageContext =
    ambientPageContextKey && disabledPageContextKey === ambientPageContextKey
      ? null
      : ambientPageContext;
  const isPageContextVisible = Boolean(effectivePageContext);

  const availableSlashCommands = useMemo(() => {
    const pageType = effectivePageContext?.pageType ?? "";
    if (!pageType) return [];
    return SLASH_COMMANDS.filter((cmd) => cmd.pageTypes.includes(pageType));
  }, [effectivePageContext?.pageType]);
  const ambientContextDisplay = useMemo(
    () => getAmbientContextDisplay(effectivePageContext),
    [effectivePageContext],
  );
  const contextComposerShellClassName = isPageContextVisible
    ? "rounded-[14px] bg-surface-2/55 p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
    : "";
  const contextInputShellClassName = isPageContextVisible
    ? "relative rounded-[10px] border border-border bg-surface-1 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_rgba(15,23,42,0.08)]"
    : "relative rounded-[8px] border border-border bg-surface-1";

  const filteredSlashCommands = availableSlashCommands.filter((cmd) =>
    cmd.command.slice(1).toLowerCase().startsWith(slashQuery.toLowerCase()),
  );

  const hubConnectionRef = useRef<signalR.HubConnection | null>(null);

  // Stream the assistant's reply for the active conversation over AssistantHub. Reconnects
  // whenever conversationId changes (a fresh "New chat" or reopening from history later).
  useEffect(() => {
    if (!conversationId) return;

    const connection = createHubConnection("/api/v1/assistant/chat-hub");
    hubConnectionRef.current = connection;

    const upsertAssistantMessage = (
      messageId: string,
      updater: (prev: ChatMessage | undefined) => ChatMessage,
    ) => {
      setMessages((prev) => {
        const index = prev.findIndex((m) => m.id === messageId);
        if (index === -1) return [...prev, updater(undefined)];
        const next = [...prev];
        next[index] = updater(next[index]);
        return next;
      });
    };

    connection.on(
      "AssistantMessageStarted",
      (payload: { conversationId: string; messageId: string }) => {
        if (payload.conversationId !== conversationId) return;
        setIsAiTyping(true);
        // A new turn starts a new trail; the previous one has been folded into the answer it
        // produced and stays there.
        //
        // Seeded with the step that is genuinely running: before the first tool call WarpBot is
        // reading the question, which on a slow turn is the longest stretch of the whole thing
        // and used to be drawn as a bare "Thinking..." with no trail at all.
        setSteps([{ key: THINKING_STEP, tool: THINKING_STEP, done: false }]);
        turnStartedAtRef.current = Date.now();
        setIsSlow(false);
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
      (payload: {
        conversationId: string;
        messageId: string;
        delta: string;
      }) => {
        if (payload.conversationId !== conversationId) return;
        setIsAiTyping(false);
        setIsSlow(false);
        // Marked finished, NOT discarded. Once prose starts arriving no tool is still running,
        // but what it ran is exactly what the reader wants left on screen — and writing the
        // answer is itself a step, so the trail names it rather than going quiet for the
        // longest visible part of the turn.
        setSteps((current) => {
          const settled = current.map((step) => ({ ...step, done: true }));
          return settled.some((step) => step.tool === WRITING_STEP)
            ? settled
            : [...settled, { key: WRITING_STEP, tool: WRITING_STEP, done: false }];
        });
        // Still mid-turn: re-arm rather than clear, so a stream that dies halfway through
        // also surfaces instead of freezing under a half-written answer.
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
        if (payload.conversationId !== conversationId) return;
        setIsAiTyping(true);
        setSteps((current) => [
          // Anything still marked running when a new tool starts has finished — the worker
          // emits a completed for each, but the trail must not show two spinners if one is lost.
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
        if (payload.conversationId !== conversationId) return;
        const title = payload.title?.trim() ?? "";
        const body = payload.body?.trim() ?? "";
        if (!title && !body) return;
        setIsAiTyping(true);
        setSteps((current) => [
          // The model has moved on from whatever it was doing when it wrote this.
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
        if (payload.conversationId !== conversationId) return;
        const questions = parseAssistantQuestions(payload.questionsJson);
        // A malformed payload leaves the card absent rather than rendering an empty shell —
        // the user's own message box still works, which is the fallback that matters.
        if (questions.length) setPendingQuestions(questions);
        armResponseTimeout();
      },
    );

    connection.on(
      "AssistantToolCallCompleted",
      (payload: { conversationId: string; toolName?: string; toolDetail?: string }) => {
        if (payload.conversationId !== conversationId) return;
        // The hosted web search publishes its started event before OpenAI has said what it is
        // searching for, so this is often the first event that can name the target.
        setSteps((current) =>
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
        if (payload.conversationId !== conversationId) return;
        setIsAiTyping(false);
        setIsSlow(false);
        clearResponseTimeout();

        // Folded onto the answer, not deleted.
        //
        // This used to clear the trail outright, arguing that a finished turn showing its steps
        // claims they are still worth watching. Half right: they are not worth WATCHING, and
        // throwing them away also threw away the only record of which tools an answer came
        // through — the first thing a person checking a surprising answer reaches for. It is one
        // folded line now: over, and still there.
        const finishedSteps = steps.map((step) => ({ ...step, done: true }));
        const startedAt = turnStartedAtRef.current;
        turnStartedAtRef.current = null;
        setSteps([]);

        // Only the completed event carries them: the worker decides which sources the answer
        // pointed at once the whole answer exists, so there is nothing to show mid-stream.
        upsertAssistantMessage(payload.id, () => ({
          id: payload.id,
          role: "assistant",
          content: payload.content,
          sources: parseAnswerSources(payload.sourcesJson),
          steps: finishedSteps.length > 0 ? finishedSteps : undefined,
          durationMs: startedAt ? Date.now() - startedAt : undefined,
        }));
      },
    );

    connection.on(
      "AssistantMessageFailed",
      (payload: {
        conversationId: string;
        messageId: string;
        error: string;
      }) => {
        if (payload.conversationId !== conversationId) return;
        setIsAiTyping(false);
        setIsSlow(false);
        clearResponseTimeout();
        // A failure is the case the trail matters MOST: how far it got is the only clue to why.
        const failedSteps = steps.map((step) => ({ ...step, done: true }));
        const failedStartedAt = turnStartedAtRef.current;
        turnStartedAtRef.current = null;
        setSteps([]);
        upsertAssistantMessage(payload.messageId, () => ({
          id: payload.messageId,
          role: "assistant",
          content: payload.error,
          failed: true,
          steps: failedSteps.length > 0 ? failedSteps : undefined,
          durationMs: failedStartedAt ? Date.now() - failedStartedAt : undefined,
        }));
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
        if (payload.conversationId !== conversationId) return;
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

    // withAutomaticReconnect (lib/signalr.ts) brings the socket back but NOT the SignalR
    // group membership. Without this re-join, one transport blip means every token the
    // worker streams for this conversation is delivered to a client that is no longer in
    // the group — the widget just sits on "Thinking..." forever.
    connection.onreconnecting(() => {
      joinedConversationIdRef.current = null;
    });
    connection.onreconnected(() => {
      joinedConversationIdRef.current = null;
      void joinConversation().catch(() => {
        // Still unjoined; the response watchdog surfaces it as a real error.
      });
    });
    connection.onclose(() => {
      joinedConversationIdRef.current = null;
    });

    connection
      .start()
      .then(joinConversation)
      .catch(() => {
        // joinedConversationIdRef stays null, so sendMessage's join wait times out and the
        // response watchdog turns the stalled spinner into a visible error.
      });

    return () => {
      joinedConversationIdRef.current = null;
      void connection.stop();
      hubConnectionRef.current = null;
    };
  }, [conversationId, armResponseTimeout, clearResponseTimeout]);

  // Calculate mention/slash menu visibility based on @ or leading / characters
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputValue(val);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPosition);

    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionMenuOpen(true);
      setMentionQuery(mentionMatch[1]);
    } else {
      setMentionMenuOpen(false);
    }

    // Only when "/" is the very first thing typed (Slack-style) — not mid-sentence — and
    // only where this page actually has commands. Opening an empty menu on a page with no
    // ambient context used to hijack Enter and leave the message unsendable.
    const slashMatch = textBeforeCursor.match(/^\/([\w-]*)$/);
    if (slashMatch && availableSlashCommands.length > 0) {
      setSlashMenuOpen(true);
      setSlashQuery(slashMatch[1]);
      setSlashSelectedIndex(0);
    } else {
      setSlashMenuOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Every branch that handles a key here must return. Falling through to the send path
    // below runs sendMessage() in the same handler, against pre-update state — which is how
    // picking a mention with Enter used to send the literal "@Al" with no mentions attached
    // and leave the chip dangling for the *next* message.
    if (slashMenuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIndex((prev) =>
          Math.min(prev + 1, filteredSlashCommands.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const command = filteredSlashCommands[slashSelectedIndex];
        if (command) {
          insertSlashCommand(command);
          return;
        }
        // Nothing matched what was typed — send it as ordinary text instead of swallowing
        // the keystroke and leaving the user with no way out but Escape.
        setSlashMenuOpen(false);
        void sendMessage();
        return;
      }
      return;
    }

    if (mentionMenuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredOptions.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionMenuOpen(false);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // Guard the index: with a query that matches nothing (e.g. "@zzzz") this used to
        // call insertMention(undefined), which throws inside a setState updater and takes
        // the whole page down through the error boundary.
        const option = filteredOptions[selectedIndex];
        if (option) {
          insertMention(option);
          return;
        }
        setMentionMenuOpen(false);
        void sendMessage();
        return;
      }
      return;
    }

    // Handle backspace when input is empty to delete the last context
    if (
      e.key === "Backspace" &&
      inputValue === "" &&
      selectedContexts.length > 0
    ) {
      setSelectedContexts((prev) => prev.slice(0, -1));
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const filteredOptions = CONTEXT_OPTIONS.filter((opt) =>
    opt.title.toLowerCase().includes(mentionQuery.toLowerCase()),
  );

  const insertMention = (opt: (typeof CONTEXT_OPTIONS)[0]) => {
    setSelectedContexts((prev) => {
      if (prev.find((p) => p.id === opt.id)) return prev;
      return [...prev, opt];
    });

    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = inputValue.slice(0, cursorPosition);
    const textAfterCursor = inputValue.slice(cursorPosition);

    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      const newTextBefore = textBeforeCursor.slice(0, mentionMatch.index);
      setInputValue(newTextBefore + textAfterCursor);
    }

    setMentionMenuOpen(false);

    // Focus back
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleMentionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const option = CONTEXT_OPTIONS.find(
      (item) => item.id === event.currentTarget.dataset.optionId,
    );
    if (option) insertMention(option);
  };

  const insertSlashCommand = (cmd: SlashCommand) => {
    const prompt = cmd.buildPrompt(effectivePageContext);
    setSlashMenuOpen(false);

    if (cmd.autoSend) {
      // inputValue state hasn't flushed yet — pass the prompt directly rather than
      // relying on the (stale) inputValue read inside sendMessage.
      setInputValue("");
      void sendMessage(prompt);
      return;
    }

    setInputValue(prompt);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prompt.length, prompt.length);
    }, 0);
  };

  // Autoscroll, same shape as chat-panel.tsx: follow new content, but never yank a user who
  // has deliberately scrolled up to re-read an earlier answer back down to the bottom.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isAiTyping, steps, isOpen, isExpanded]);

  const { isAway, scrollToLatest } = useScrollToLatest(messagesContainerRef, {
    // The same slack handleMessagesScroll uses to decide the widget is still following.
    threshold: AUTOSCROLL_THRESHOLD_PX,
    // Steps and the typing flag too: a long answer grows the list without adding a message, and
    // that is exactly when a reader who scrolled up needs to be told the bottom has moved.
    revision: `${messages.length}:${steps.length}:${isAiTyping}`,
  });

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < AUTOSCROLL_THRESHOLD_PX;
  };

  const togglePageContextVisibility = () => {
    if (!ambientPageContextKey) return;
    setDisabledPageContextKey((currentKey) =>
      currentKey === ambientPageContextKey ? null : ambientPageContextKey,
    );
  };

  /**
   * WT-474: files pasted, picked or dropped into the composer.
   *
   * A person debugging asks "what is wrong with this screen" and the screen IS the question; the
   * same person asks "does this contract allow X" and the PDF is. Describing either in words is
   * exactly the work the model could have done.
   *
   * PER-TURN, LIKE @MENTIONS. Nothing stores these: they go with one message and are cleared, so a
   * follow-up cannot see them. The strip says so out loud, because a user who attaches once and
   * then asks "and the red box?" would otherwise get a confident answer about a file the model
   * never received.
   */
  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;

    let accepted = attachments.length;
    for (const file of files) {
      const reason = rejectionReason(file, accepted);
      if (reason) {
        toast.error(reason);
        // `break` rather than `continue` once the COUNT is the problem: every remaining file would
        // produce the same toast, and four identical toasts is worse than one.
        if (accepted >= MAX_ATTACHMENTS) break;
        continue;
      }
      try {
        const attachment = await toAttachment(file);
        setAttachments((prev) => [...prev, attachment]);
        accepted += 1;
      } catch {
        toast.error(`"${file.name}" could not be read.`);
      }
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Only intercept when the clipboard actually carries a FILE. Pasting TEXT must stay completely
    // untouched, including text copied out of an app that also puts an image flavour on the
    // clipboard — hence checking the item kind rather than just `files.length`.
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (files.length === 0) return;
    event.preventDefault();
    void addFiles(files);
  };

  const handleDrop = (event: React.DragEvent) => {
    setDragDepth(0);
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    void addFiles(files);
  };

  const sendMessage = async (overrideContent?: string) => {
    const content = (overrideContent ?? inputValue).trim();
    // WT-541: the same rule the send button is disabled by. It used to be spelled out here and
    // only half-spelled on the button, so a turn with no workspace was swallowed by a control
    // that looked alive.
    const readiness = composerReadiness({
      text: content,
      attachmentCount: attachments.length,
      activeWorkspaceId,
    });
    if (!readiness.canSend) return;
    // The id travels with the yes, so this handler cannot disagree with the check above about
    // which workspace the turn belongs to.
    const sendWorkspaceId = readiness.workspaceId;

    // Explicit @mentions are per-message: build the list from whatever's attached right
    // now, then clear the chips so they don't silently ride along with the *next*
    // unrelated message too.
    const mentions: AssistantMentionDto[] = selectedContexts
      .filter(
        (
          ctx,
        ): ctx is AssistantContextOption & {
          entityType: AssistantMentionDto["entityType"];
          entityId: string;
        } => Boolean(ctx.entityType && ctx.entityId),
      )
      .map((ctx) => ({
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        label: ctx.title,
      }));

    // Captured before the state is cleared, for the same reason mentions are: this handler runs
    // against pre-update state and the request is built further down.
    const sentAttachments = attachments;

    setInputValue("");
    setMentionMenuOpen(false);
    setSelectedContexts([]);
    setAttachments([]);

    let convId = conversationId;
    if (!convId) {
      try {
        const conversation =
          await createConversation.mutateAsync(sendWorkspaceId);
        convId = conversation.id;
        setConversationId(convId);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: `local-${Date.now()}`, role: "user", content },
          {
            id: `conv-failed-${Date.now()}`,
            role: "assistant",
            content: "Couldn't start a conversation with WarpBot. Please try again.",
            failed: true,
          },
        ]);
        return;
      }
    }

    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content },
    ]);
    setIsAiTyping(true);
    shouldAutoScrollRef.current = true;
    armResponseTimeout();

    try {
      // The hub effect only begins negotiating once conversationId is in state, so without
      // this the first message of a conversation is POSTed before the client has joined the
      // group and its whole answer streams past an unsubscribed client.
      await waitForConversationJoin(convId);
      // Ambient page context (e.g. "user is looking at this room") rides along with every
      // message automatically — no explicit @-mention needed. It's a hint, not a hard fact:
      // .NET re-validates it against the conversation's own workspace before forwarding it.
      await sendAssistantMessage.mutateAsync({
        conversationId: convId,
        content,
        pageContext: effectivePageContext,
        mentions,
        attachments: sentAttachments,
      });
      // The assistant's reply streams in over AssistantHub — see the connection effect above.
    } catch {
      clearResponseTimeout();
      setIsAiTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `send-failed-${Date.now()}`,
          role: "assistant",
          content: "That message couldn't be sent. Please try again.",
          failed: true,
        },
      ]);
    }
  };

  return (
    <>
      {/* Global Bottom Bar */}
      <div className="py-1 bg-transparent flex items-center justify-end px-2 shrink-0 z-40 relative mb-0.5">
        <div className="flex items-center gap-0.5">
          <AnimatePresence>
            {isMinimized && messages.length > 0 && (
              <motion.button
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => {
                  setIsOpen(true);
                  setIsMinimized(false);
                }}
                className="flex items-center h-[26px] px-3 rounded-[6px] bg-surface-2 hover:bg-surface-3 transition-colors text-ink text-[12px] font-medium mr-1 truncate max-w-[200px]"
              >
                {messages.find((m) => m.role === "user")?.content || "New chat"}
              </motion.button>
            )}
          </AnimatePresence>

          <Popover
            open={isOpen}
            onOpenChange={(open) => {
              if (open) {
                // Re-opening must NOT start a new conversation: this is the only
                // always-visible entry point, so wiping here threw away the answer the
                // user just asked for, with no way to get it back.
                setIsMinimized(false);
                shouldAutoScrollRef.current = true;
              } else if (messages.length > 0) {
                setIsMinimized(true);
              }
              setIsOpen(open);
            }}
          >
            <PopoverTrigger
              aria-label="Ask WarpBot"
              data-tour="warpbot-launcher"
              className="flex items-center h-[26px] pl-[8px] pr-[10px] rounded-[6px] bg-surface-2 hover:bg-surface-3 transition-colors group text-ink"
            >
              <span
                aria-hidden="true"
                className="mr-[6px] flex items-center justify-center"
              >
                <PaperPlaneTilt
                  weight="regular"
                  className="text-ink transition-colors"
                  size={13}
                />
              </span>
              <span className="text-[12px] leading-none whitespace-nowrap">
                Ask WarpBot
              </span>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className={`p-0 bg-surface-1 border border-border shadow-xl rounded-xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${isExpanded ? "w-[680px] h-[600px]" : "w-[460px] h-[412px]"}`}
            >
              {/* Chat Header */}
              <div className="flex items-center justify-between h-[48px] px-4 shrink-0">
                <span className="font-semibold text-[13px] text-ink truncate">
                  {conversationTitle}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setIsMinimized(true);
                    }}
                    className="size-6 flex items-center justify-center rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
                  >
                    <span className="w-2.5 h-[1.5px] bg-current rounded-full" />
                  </button>
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="size-6 flex items-center justify-center rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
                  >
                    {isExpanded ? (
                      <CornersIn size={14} />
                    ) : (
                      <ArrowsOutSimple size={14} />
                    )}
                  </button>
                  <button
                    aria-label="New chat"
                    title="New chat"
                    onClick={startNewConversation}
                    className="size-6 flex items-center justify-center rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
                  >
                    <Plus size={16} className="rotate-45" />
                  </button>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="relative flex min-h-0 flex-1 flex-col">
              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="min-h-0 flex-1 overflow-y-auto px-2 flex flex-col gap-4"
              >
                {messages.length > 0 &&
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {/* The assistant writes markdown and this printed the source of it:
                          "## Action items" and "**bold**" reached the reader as those
                          characters. whitespace-pre-wrap kept the line breaks and nothing
                          else. What a person typed is rendered as typed — their asterisks
                          are asterisks. */}
                      <div
                        className={`max-w-[85%] text-[13px] leading-relaxed break-words ${
                          msg.role === "user"
                            ? "bg-surface-2 text-ink rounded-[12px] px-3.5 py-2 whitespace-pre-wrap"
                            : msg.failed
                              ? "text-red-500 py-2 pl-4 whitespace-pre-wrap"
                              : "text-ink py-2 pl-4"
                        }`}
                      >
                        {msg.role === "assistant" && !msg.failed ? (
                          <>
                            <AssistantMarkdown>{msg.content}</AssistantMarkdown>
                            <AnswerSources
                              sources={msg.sources ?? []}
                              workspaceSlug={activeWorkspaceSlug}
                            />
                            {/* Under the answer, folded. Over as a progress display, still there
                                as the record of which tools it came through. */}
                            <AssistantWorkTrail
                              steps={msg.steps ?? []}
                              running={false}
                              durationMs={msg.durationMs}
                            />
                          </>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                {steps.length > 0 && (
                  <div className="flex justify-start">
                    <AssistantWorkTrail
                      steps={steps}
                      running
                      slow={isSlow}
                      className="ml-4 mr-2 flex-1"
                    />
                  </div>
                )}

                {/* Only when there is no trail to say it on. With one on screen this repeated the
                    same fact in a second place. */}
                {isSlow && steps.length === 0 && (
                  <p className="py-1 pl-4 text-[12px] text-ink-subtle">
                    Still working — this one is taking a while.
                  </p>
                )}

                {/* Only before the first tool names itself. Once there is a trail it says more
                    than a spinner can, and showing both puts two answers to one question on
                    screen. */}
                {isAiTyping && steps.length === 0 && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 text-[13px] text-ink-subtle py-2 pl-4">
                      <LumidotSpinner />
                      <span>Thinking...</span>
                    </div>
                  </div>
                )}

                {/* Last in the thread, not attached to a message: the questions belong to the
                    turn that is still open, and pinning them to a bubble would leave them
                    scrolled away above whatever WarpBot said while asking. */}
                {pendingQuestions ? (
                  <div className="pl-4">
                    <AssistantQuestionCard
                      questions={pendingQuestions}
                      disabled={isAiTyping}
                      onSubmit={(answer) => {
                        // An ordinary message, sent the ordinary way. Nothing is paused waiting
                        // for this, so the assistant simply reads it on its next turn with the
                        // whole conversation in front of it.
                        setPendingQuestions(null);
                        void sendMessage(answer);
                      }}
                    />
                  </div>
                ) : null}
              </div>
              {/* Only the widget gets the fade. It is a small panel with a hard bottom edge against
                  the composer, so an answer ends mid-sentence at a cut line; the taller in-meeting
                  panels end against the page and read as continuing on their own. */}
              {/* Only while the reader is up the page. It used to render unconditionally, so
                  at the bottom — where every reader spends most of their time — a soft band sat
                  over the last two lines of the answer they were reading. The edge exists to say
                  "there is more below"; at the bottom there is not. */}
              <ScrollFadeEdge visible={isAway} />
              <ScrollToLatestChip visible={isAway} onClick={scrollToLatest} />
              </div>

              {/* Chat Input Section
                  The context chip is IN FLOW, not absolutely positioned.

                  It used to be `absolute bottom-2 h-[118px]` inside this `shrink-0` section
                  — a fixed-height tray anchored to the bottom, drawn behind the composer.
                  The section is only as tall as the composer, so the remaining ~30px of that
                  118px hung upward INTO the message list and painted over the last answer.
                  That is the reported overlap, and it could not be tuned away: the composer
                  grows with the text in it, so any fixed height is wrong at some height.

                  Wrapping the chip and the composer in the tray gets the same look — chip
                  above the input, both inside one rounded shell — out of the flex layout,
                  which reserves the space it actually occupies. */}
              <div className="relative px-2 pb-2 shrink-0">
                <div className={contextComposerShellClassName}>
                <AnimatePresence initial={false}>
                  {ambientContextDisplay && (
                    <motion.div
                      key="page-context-shell"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="flex min-h-[30px] items-center rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-ink">
                        <div
                          aria-label="Active page context"
                          title={`${ambientContextDisplay.pageLabel}: ${ambientContextDisplay.title}`}
                          className="flex min-w-0 flex-1 items-center gap-1.5"
                        >
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-surface-1 text-ink-muted ring-1 ring-border/80">
                            {ambientContextDisplay.icon}
                          </span>
                          <span className="shrink-0 text-[12px] text-ink-muted">
                            {ambientContextDisplay.pageLabel}
                          </span>
                          <span className="min-w-0 truncate">
                            {ambientContextDisplay.title}
                          </span>
                          {ambientContextDisplay.status && (
                            <span className="shrink-0 rounded-[6px] bg-surface-1 px-1.5 py-0.5 text-[11px] font-medium text-ink-subtle ring-1 ring-border">
                              {ambientContextDisplay.status}
                            </span>
                          )}
                        </div>
                        <button
                          aria-label="Remove page context"
                          title="Remove page context"
                          onClick={() =>
                            setDisabledPageContextKey(ambientPageContextKey)
                          }
                          className="ml-2 flex size-5 shrink-0 items-center justify-center rounded-[6px] text-ink-subtle transition-colors hover:bg-surface-1 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <X size={12} weight="bold" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className={`${contextInputShellClassName} relative z-10`}>
                  {/* Slash Command Dropdown */}
                  <AnimatePresence>
                    {slashMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full mb-1.5 left-0 w-full max-w-[320px] max-h-[300px] overflow-y-auto bg-surface-1 border border-border rounded-xl shadow-xl flex flex-col z-50 py-1.5"
                      >
                        {filteredSlashCommands.length > 0 ? (
                          filteredSlashCommands.map((cmd, i) => (
                            <button
                              key={cmd.command}
                              onClick={() => insertSlashCommand(cmd)}
                              onMouseEnter={() => setSlashSelectedIndex(i)}
                              className={`flex items-center gap-2.5 w-full text-left px-3 py-1.5 mx-1.5 rounded-[6px] text-[13px] transition-colors w-[calc(100%-12px)] ${
                                i === slashSelectedIndex
                                  ? "bg-surface-2 text-ink"
                                  : "text-ink-muted hover:bg-surface-2/50"
                              }`}
                            >
                              <span className="flex items-center justify-center size-5 shrink-0 font-mono text-[13px] text-ink-subtle">
                                /
                              </span>
                              <div className="flex min-w-0 flex-col">
                                <span className="font-medium truncate">
                                  {cmd.label}
                                </span>
                                <span className="text-[11px] text-ink-subtle truncate">
                                  {cmd.command} — {cmd.description}
                                </span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-4 text-center text-[12px] text-ink-subtle">
                            No matching command — press Enter to send this as a
                            message
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Mention Dropdown */}
                  <AnimatePresence>
                    {mentionMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full mb-1.5 left-0 w-full max-w-[320px] max-h-[300px] overflow-y-auto bg-surface-1 border border-border rounded-xl shadow-xl flex flex-col z-50 py-1.5"
                      >
                        {filteredOptions.length > 0 ? (
                          Array.from(
                            new Set(filteredOptions.map((o) => o.type)),
                          ).map((type) => (
                            <div key={type} className="flex flex-col">
                              <div className="px-3 py-1.5 text-[11px] font-medium text-ink-subtle">
                                {type}
                              </div>
                              {filteredOptions
                                .filter((o) => o.type === type)
                                .map((opt) => {
                                  const i = filteredOptions.findIndex(
                                    (o) => o.id === opt.id,
                                  );
                                  return (
                                    <button
                                      key={opt.id}
                                      data-option-id={opt.id}
                                      onClick={handleMentionClick}
                                      onMouseEnter={() => setSelectedIndex(i)}
                                      className={`flex items-center gap-2.5 w-full text-left px-3 py-1.5 mx-1.5 rounded-[6px] text-[13px] transition-colors w-[calc(100%-12px)] ${
                                        i === selectedIndex
                                          ? "bg-surface-2 text-ink"
                                          : "text-ink-muted hover:bg-surface-2/50"
                                      }`}
                                    >
                                      {opt.isAvatar ? (
                                        <div className="flex items-center justify-center size-5 rounded-full shrink-0 text-[9px] font-medium text-white bg-ink">
                                          {opt.icon}
                                        </div>
                                      ) : (
                                        <span className="flex items-center justify-center size-5 shrink-0 text-[14px]">
                                          {opt.icon}
                                        </span>
                                      )}
                                      <div className="flex items-center gap-1.5 truncate">
                                        <span className="font-medium truncate">
                                          {opt.title}
                                        </span>
                                        {opt.description && (
                                          <span className="text-[12px] text-ink-subtle truncate">
                                            {opt.description}
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-4 text-center text-[12px] text-ink-subtle">
                            No contexts found
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* WT-474: the input area is the drop target.
                      dragDepth is a COUNTER, not a boolean: dragging across a child element fires
                      dragleave on the parent, so a boolean flickers the highlight off mid-drag.
                      onDragOver must preventDefault or the browser navigates to the dropped file
                      instead of handing it over. */}
                  <div
                    onDragEnter={(event) => {
                      if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                      setDragDepth((depth) => depth + 1);
                    }}
                    onDragOver={(event) => {
                      if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                      event.preventDefault();
                    }}
                    onDragLeave={() => setDragDepth((depth) => Math.max(0, depth - 1))}
                    onDrop={handleDrop}
                    className={cn(
                      "flex flex-wrap items-center gap-1.5 w-full min-h-[38px] max-h-[120px] bg-transparent px-2 py-1.5 overflow-y-auto rounded-[10px] transition-colors",
                      dragDepth > 0 && "bg-primary/5 outline-dashed outline-1 outline-primary/40",
                    )}
                  >
                    {selectedContexts.map((ctx) => (
                      <span
                        key={ctx.id}
                        className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-md text-[12px] font-medium"
                      >
                        {ctx.isAvatar ? (
                          <span className="flex items-center justify-center size-3.5 rounded-full shrink-0 text-[7px] font-bold text-white bg-ink">
                            {ctx.icon}
                          </span>
                        ) : (
                          <span className="flex items-center justify-center size-3.5 shrink-0">
                            {ctx.icon}
                          </span>
                        )}
                        {ctx.title}
                        <button
                          type="button"
                          aria-label={`Remove ${ctx.title} from this message`}
                          title={`Remove ${ctx.title}`}
                          onClick={() =>
                            setSelectedContexts((prev) =>
                              prev.filter((item) => item.id !== ctx.id),
                            )
                          }
                          className="ml-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-primary/20"
                        >
                          <X size={9} weight="bold" />
                        </button>
                      </span>
                    ))}
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={handleInput}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder={
                        selectedContexts.length > 0
                          ? ""
                          : ambientContextDisplay
                            ? "Ask with page context..."
                            : "Ask WarpBot..."
                      }
                      className="flex-1 min-w-[120px] bg-transparent resize-none outline-none text-[13px] text-ink placeholder:text-ink-subtle self-stretch"
                      rows={1}
                    />
                  </div>

                  <ChatAttachmentStrip
                    attachments={attachments}
                    onRemove={(index) =>
                      setAttachments((prev) => prev.filter((_, i) => i !== index))
                    }
                  />

                  {/* WT-541 — said on screen, not only in the send button's tooltip.
                      The admin portal is outside [workspaceSlug], so an admin who signs in and
                      goes straight to /admin has no active workspace and every WarpBot turn was
                      swallowed in silence. A disabled button explains nothing to somebody who
                      has already typed their question. */}
                  {composerState.blocker === "no-workspace" ? (
                    <p className="px-2.5 pb-1.5 text-[11px] leading-4 text-ink-subtle">
                      {composerState.hint}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between px-1.5 pb-1.5">
                    {/* WT-474: the paperclip sits with Skills, at the left of the control row,
                        which is where Claude and Codex put it — the composer's own actions on one
                        side, send on the other. */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ATTACHMENT_ACCEPT}
                      className="hidden"
                      onChange={(event) => {
                        void addFiles(Array.from(event.target.files ?? []));
                        // Cleared so picking the SAME file twice in a row still fires onChange.
                        event.target.value = "";
                      }}
                    />
                    <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach images or documents"
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors text-[12px] font-medium"
                    >
                      <Paperclip weight="regular" size={14} />
                    </button>
                    <Popover
                      open={skillsMenuOpen}
                      onOpenChange={setSkillsMenuOpen}
                    >
                      <PopoverTrigger className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors text-[12px] font-medium">
                        <Cube weight="regular" size={14} />
                        Skills
                        <CaretDown
                          weight="bold"
                          size={10}
                          className="text-ink-subtle ml-0.5"
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="top"
                        sideOffset={8}
                        className="p-1.5 w-[260px] bg-surface-1 border border-border shadow-xl rounded-xl"
                      >
                        {skills && skills.length > 0 ? (
                          // Read-only capability list: skills are the assistant's own
                          // tools, picked by the model mid-turn — there is nothing for a
                          // click to do, so these rows no longer pretend to be buttons.
                          <ul className="flex flex-col">
                            <li className="px-2.5 pt-1 pb-1.5 text-[11px] text-ink-subtle">
                              WarpBot uses these automatically when a question needs them.
                            </li>
                            {skills.map((skill) => (
                              <li
                                key={skill.name}
                                className="flex cursor-default flex-col gap-0.5 px-2.5 py-1.5"
                              >
                                <span className="text-[12px] font-medium text-ink">
                                  {skill.label}
                                </span>
                                <span className="text-[11px] text-ink-subtle">
                                  {skill.description}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="px-2.5 py-3 text-center text-[12px] text-ink-subtle">
                            Loading skills…
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        aria-label={
                          isPageContextVisible
                            ? "Hide page context"
                            : "Show page context"
                        }
                        title={
                          isPageContextVisible
                            ? "Hide page context"
                            : "Show page context"
                        }
                        onClick={togglePageContextVisibility}
                        disabled={!ambientPageContextKey}
                        className="flex items-center justify-center size-7 rounded-full bg-surface-2 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                      >
                        {isPageContextVisible ? (
                          <CornersIn size={14} />
                        ) : (
                          <ArrowsOutSimple size={14} />
                        )}
                      </button>
                      {/* WT-474: the paperclip lives on the LEFT of this row now, beside Skills.
                          It once sat here with no handler and nothing to wire it to, and was
                          removed rather than left on screen as a control that cannot succeed —
                          the attachment path it needed now exists. */}
                      <button
                        type="button"
                        aria-label="Send message"
                        onClick={() => void sendMessage()}
                        // WT-474: an attachment on its own is a question, so send is live for a
                        // turn carrying only files. Matching the same rule in sendMessage and in
                        // AssistantService — a button the server would accept must not look dead.
                        //
                        // WT-541 is the converse, and was the actual bug: a button the server
                        // CANNOT accept must not look alive. Both now read one rule.
                        disabled={!composerState.canSend}
                        title={composerState.hint ?? "Send message"}
                        className="flex items-center justify-center size-[26px] rounded-full bg-ink text-surface-1 hover:bg-ink-muted disabled:opacity-50 disabled:bg-surface-2 disabled:text-ink-muted transition-colors ml-1"
                      >
                        <ArrowUp weight="bold" size={13} />
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Chat history — previously a permanently visible button with no handler and no
              history UI behind it at all. It now opens this workspace's past conversations
              and reloads the selected one back into the widget. */}
          <Popover open={historyMenuOpen} onOpenChange={setHistoryMenuOpen}>
            <PopoverTrigger
              aria-label="Chat history"
              title="Chat history"
              disabled={!activeWorkspaceId}
              className="flex items-center justify-center size-[26px] rounded-[6px] text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              <ClockCounterClockwise weight="regular" size={14} />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="p-1.5 w-[280px] max-h-[320px] overflow-y-auto bg-surface-1 border border-border shadow-xl rounded-xl"
            >
              {conversationsQuery.isLoading || loadConversation.isPending ? (
                <div className="px-2.5 py-3 text-center text-[12px] text-ink-subtle">
                  Loading conversations…
                </div>
              ) : conversationsQuery.isError ? (
                <div className="px-2.5 py-3 text-center text-[12px] text-red-500">
                  Could not load chat history.
                </div>
              ) : visibleConversations.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-[12px] text-ink-subtle">
                  No past conversations yet
                </div>
              ) : (
                <div className="flex flex-col">
                  {visibleConversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() =>
                        void openConversationFromHistory(conversation)
                      }
                      className="flex flex-col gap-0.5 px-2.5 py-1.5 text-left rounded-md hover:bg-surface-2 transition-colors"
                    >
                      <span className="truncate text-[12px] font-medium text-ink">
                        {conversation.title?.trim() || "New chat"}
                      </span>
                      <span className="text-[11px] text-ink-subtle">
                        {formatConversationTimestamp(
                          conversation.lastMessageAt ?? conversation.createdAt,
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </>
  );
}
