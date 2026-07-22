"use client";

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { ArrowUp, Sparkle, ClockCounterClockwise, Question, ArrowsOutSimple, CornersIn, PaperPlaneRight, CaretUp, Plus, MagnifyingGlass, PaperPlaneTilt, Cube, CaretDown, FileText, Chats, BookBookmark, VideoCamera } from "@phosphor-icons/react/dist/ssr";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAssistantContextStore } from "@/stores/assistant-context-store";
import { useWorkspaceMembers, useWorkspaceDocuments } from "@/hooks/use-workspace";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { useAssistantSkills, useCreateAssistantConversation, useSendAssistantMessage } from "@/hooks/use-assistant";
import { createHubConnection } from "@/lib/signalr";
import type * as signalR from "@microsoft/signalr";
import type { AssistantMentionDto, AssistantPageContextDto } from "@/types/assistant";
import { Lumidot } from "lumidot";
import { useTheme } from "next-themes";

interface AssistantContextOption {
  id: string;
  title: string;
  type: string;
  icon: ReactNode;
  description: string;
  link: string;
  isAvatar?: boolean;
  /** Set only for options that map to a real backend entity the assistant can look up. */
  entityType?: AssistantMentionDto["entityType"];
  entityId?: string;
}

// Not fetchable — describes the page the widget was opened from, not workspace data.
const STATIC_CONTEXT_OPTIONS: AssistantContextOption[] = [
  { id: "this-page", title: "Current meeting context", type: "This page", icon: <FileText size={14} className="text-[#34c759]" />, description: "", link: "#" },
  { id: "all-transcripts", title: "All Transcripts", type: "Resources", icon: <Chats size={14} />, description: "Search transcripts", link: "/transcripts" },
  { id: "terminology", title: "Terminology", type: "Resources", icon: <BookBookmark size={14} />, description: "Search terminology", link: "/terminology" },
];

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  context?: string;
  failed?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  search_workspace_members: "Searching workspace members…",
  search_terminology: "Searching terminology…",
  list_recent_meetings: "Looking up recent meetings…",
  translate_text: "Translating…",
  semantic_search: "Searching knowledge base…",
  get_meeting_summary: "Looking up meeting summary…",
  get_room_detail: "Looking up room details…",
  get_transcript: "Reading the transcript…",
  get_document: "Reading the document…",
};

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
    buildPrompt: () => "List the action items and key decisions from this meeting's transcript.",
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
    buildPrompt: () => "Extract the key terms and terminology used in this document.",
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
  history: "History",
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
  };
}

export function GlobalChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedContexts, setSelectedContexts] = useState<AssistantContextOption[]>([]);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const user = useAuthStore((state) => state.user);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const ambientPageContext = useAssistantContextStore((state) => state.pageContext);
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const createConversation = useCreateAssistantConversation();
  const sendAssistantMessage = useSendAssistantMessage();
  const { data: skills } = useAssistantSkills();
  const [skillsMenuOpen, setSkillsMenuOpen] = useState(false);

  // Real workspace members/meetings/documents for the @mention picker — each refetches
  // as the user types after "@". Selecting one attaches a real entityId that rides along
  // with the next sent message as a structured mention (see sendMessage below), not just
  // a display chip.
  const { data: memberResults } = useWorkspaceMembers(activeWorkspaceId ?? undefined, 1, 5, mentionQuery);
  const { data: roomResults } = useTranslationRooms({ search: mentionQuery, pageSize: 5 });
  const { data: documentResults } = useWorkspaceDocuments(activeWorkspaceId ?? "", 1, 5, mentionQuery);
  const CONTEXT_OPTIONS: AssistantContextOption[] = useMemo(() => {
    const memberOptions: AssistantContextOption[] = (memberResults?.items ?? []).map((m) => ({
      id: `member-${m.userId}`,
      title: m.fullName,
      type: "Members",
      icon: (m.fullName || "?").slice(0, 1).toUpperCase(),
      isAvatar: true,
      description: m.email,
      link: "#",
      entityType: "member",
      entityId: m.userId,
    }));
    const roomOptions: AssistantContextOption[] = (roomResults?.rooms ?? []).map((r) => ({
      id: `room-${r.id}`,
      title: r.title,
      type: "Meetings",
      icon: <VideoCamera size={14} />,
      description: r.status,
      link: "#",
      entityType: "room",
      entityId: r.id,
    }));
    const documentOptions: AssistantContextOption[] = (documentResults?.items ?? []).map((d) => ({
      id: `document-${d.id}`,
      title: d.name,
      type: "Documents",
      icon: <FileText size={14} />,
      description: d.status,
      link: "#",
      entityType: "document",
      entityId: d.id,
    }));
    return [...STATIC_CONTEXT_OPTIONS, ...memberOptions, ...roomOptions, ...documentOptions];
  }, [memberResults, roomResults, documentResults]);

  // Only offer commands relevant to the page the widget was opened from — e.g. "/summarize"
  // only makes sense with a room in ambient context (see chat_worker.py's page-context
  // injection). No ambient context registered on this page ⇒ no commands to offer.
  const availableSlashCommands = useMemo(() => {
    const pageType = ambientPageContext?.pageType ?? "";
    if (!pageType) return [];
    return SLASH_COMMANDS.filter((cmd) => cmd.pageTypes.includes(pageType));
  }, [ambientPageContext?.pageType]);
  const ambientContextDisplay = useMemo(() => getAmbientContextDisplay(ambientPageContext), [ambientPageContext]);

  const filteredSlashCommands = availableSlashCommands.filter((cmd) =>
    cmd.command.slice(1).toLowerCase().startsWith(slashQuery.toLowerCase())
  );

  const hubConnectionRef = useRef<signalR.HubConnection | null>(null);

  // Stream the assistant's reply for the active conversation over AssistantHub. Reconnects
  // whenever conversationId changes (a fresh "New chat" or reopening from history later).
  useEffect(() => {
    if (!conversationId) return;

    const connection = createHubConnection("/api/v1/assistant/chat-hub");
    hubConnectionRef.current = connection;

    const upsertAssistantMessage = (messageId: string, updater: (prev: ChatMessage | undefined) => ChatMessage) => {
      setMessages((prev) => {
        const index = prev.findIndex((m) => m.id === messageId);
        if (index === -1) return [...prev, updater(undefined)];
        const next = [...prev];
        next[index] = updater(next[index]);
        return next;
      });
    };

    connection.on("AssistantMessageStarted", (payload: { conversationId: string; messageId: string }) => {
      if (payload.conversationId !== conversationId) return;
      setIsAiTyping(true);
      setActiveToolLabel(null);
      upsertAssistantMessage(payload.messageId, (prev) => ({
        id: payload.messageId,
        role: "assistant",
        content: prev?.content ?? "",
      }));
    });

    connection.on("AssistantMessageChunk", (payload: { conversationId: string; messageId: string; delta: string }) => {
      if (payload.conversationId !== conversationId) return;
      setIsAiTyping(false);
      setActiveToolLabel(null);
      upsertAssistantMessage(payload.messageId, (prev) => ({
        id: payload.messageId,
        role: "assistant",
        content: (prev?.content ?? "") + payload.delta,
      }));
    });

    connection.on("AssistantToolCallStarted", (payload: { conversationId: string; toolName: string }) => {
      if (payload.conversationId !== conversationId) return;
      setIsAiTyping(true);
      setActiveToolLabel(TOOL_LABELS[payload.toolName] ?? "Looking that up…");
    });

    connection.on("AssistantToolCallCompleted", (payload: { conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      setActiveToolLabel(null);
    });

    connection.on("AssistantMessageCompleted", (payload: { conversationId: string; id: string; content: string }) => {
      if (payload.conversationId !== conversationId) return;
      setIsAiTyping(false);
      setActiveToolLabel(null);
      upsertAssistantMessage(payload.id, () => ({
        id: payload.id,
        role: "assistant",
        content: payload.content,
      }));
    });

    connection.on("AssistantMessageFailed", (payload: { conversationId: string; messageId: string; error: string }) => {
      if (payload.conversationId !== conversationId) return;
      setIsAiTyping(false);
      setActiveToolLabel(null);
      upsertAssistantMessage(payload.messageId, () => ({
        id: payload.messageId,
        role: "assistant",
        content: payload.error,
        failed: true,
      }));
    });

    connection.on("AssistantFollowUpMessage", (payload: { conversationId: string; id: string; content: string }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) => [...prev, { id: payload.id, role: "assistant", content: payload.content }]);
    });

    connection
      .start()
      .then(() => connection.invoke("JoinConversation", conversationId))
      .catch(() => {
        // Connection failures surface as a stalled "Thinking..." indicator rather than a
        // crash — acceptable for v1, revisit with a visible retry affordance later.
      });

    return () => {
      connection.stop();
      hubConnectionRef.current = null;
    };
  }, [conversationId]);

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

    // Only when "/" is the very first thing typed (Slack-style) — not mid-sentence.
    const slashMatch = textBeforeCursor.match(/^\/([\w-]*)$/);
    if (slashMatch) {
      setSlashMenuOpen(true);
      setSlashQuery(slashMatch[1]);
      setSlashSelectedIndex(0);
    } else {
      setSlashMenuOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIndex((prev) => Math.min(prev + 1, filteredSlashCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredSlashCommands[slashSelectedIndex]) insertSlashCommand(filteredSlashCommands[slashSelectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        setSlashMenuOpen(false);
        return;
      }
      return;
    }

    if (mentionMenuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        insertMention(filteredOptions[selectedIndex]);
      }
      if (e.key === "Escape") {
        setMentionMenuOpen(false);
        return;
      }
    } else {
      // Handle backspace when input is empty to delete the last context
      if (e.key === "Backspace" && inputValue === "" && selectedContexts.length > 0) {
        setSelectedContexts(prev => prev.slice(0, -1));
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
  };

  const filteredOptions = CONTEXT_OPTIONS.filter(opt =>
    opt.title.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const insertMention = (opt: typeof CONTEXT_OPTIONS[0]) => {
    setSelectedContexts(prev => {
      if (prev.find(p => p.id === opt.id)) return prev;
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

  const removeContext = (id: string) => {
    setSelectedContexts(prev => prev.filter(c => c.id !== id));
  };

  const insertSlashCommand = (cmd: SlashCommand) => {
    const prompt = cmd.buildPrompt(ambientPageContext);
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

  const sendMessage = async (overrideContent?: string) => {
    const content = (overrideContent ?? inputValue).trim();
    if (!content || !activeWorkspaceId) return;

    // Explicit @mentions are per-message: build the list from whatever's attached right
    // now, then clear the chips so they don't silently ride along with the *next*
    // unrelated message too.
    const mentions: AssistantMentionDto[] = selectedContexts
      .filter((ctx): ctx is AssistantContextOption & { entityType: AssistantMentionDto["entityType"]; entityId: string } =>
        Boolean(ctx.entityType && ctx.entityId)
      )
      .map((ctx) => ({ entityType: ctx.entityType, entityId: ctx.entityId, label: ctx.title }));

    setInputValue("");
    setMentionMenuOpen(false);
    setSelectedContexts([]);

    let convId = conversationId;
    if (!convId) {
      try {
        const conversation = await createConversation.mutateAsync(activeWorkspaceId);
        convId = conversation.id;
        setConversationId(convId);
      } catch {
        return;
      }
    }

    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content }]);
    setIsAiTyping(true);

    try {
      // Ambient page context (e.g. "user is looking at this room") rides along with every
      // message automatically — no explicit @-mention needed. It's a hint, not a hard fact:
      // .NET re-validates it against the conversation's own workspace before forwarding it.
      await sendAssistantMessage.mutateAsync({
        conversationId: convId,
        content,
        pageContext: ambientPageContext,
        mentions,
      });
      // The assistant's reply streams in over AssistantHub — see the connection effect above.
    } catch {
      setIsAiTyping(false);
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
                {messages.find(m => m.role === 'user')?.content || "New chat"}
              </motion.button>
            )}
          </AnimatePresence>

          <Popover open={isOpen} onOpenChange={(open) => {
            if (!open && messages.length > 0) {
              setIsMinimized(true);
            }
            setIsOpen(open);
          }}>
            <PopoverTrigger
              aria-label="Ask WarpTalk"
              className="flex items-center h-[26px] pl-[8px] pr-[10px] rounded-[6px] bg-surface-2 hover:bg-surface-3 transition-colors group text-ink"
            >
              <span aria-hidden="true" className="mr-[6px] flex items-center justify-center">
                <PaperPlaneTilt weight="regular" className="text-ink transition-colors" size={13} />
              </span>
              <span className="text-[12px] leading-none whitespace-nowrap">Ask WarpTalk</span>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className={`p-0 bg-surface-1 border border-border shadow-xl rounded-xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${isExpanded ? 'w-[600px] h-[600px]' : 'w-[400px] h-[412px]'}`}
            >
              {/* Chat Header */}
              <div className="flex items-center justify-between h-[48px] px-4 shrink-0">
                <span className="font-semibold text-[13px] text-ink">New chat</span>
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
                    {isExpanded ? <CornersIn size={14} /> : <ArrowsOutSimple size={14} />}
                  </button>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setIsMinimized(false);
                      setMessages([]);
                      setConversationId(null);
                    }}
                    className="size-6 flex items-center justify-center rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
                  >
                    <Plus size={16} className="rotate-45" />
                  </button>
                </div>
              </div>

               {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto px-2 flex flex-col gap-4">
                {messages.length > 0 && (
                  messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] text-[13px] leading-relaxed ${
                        msg.role === "user"
                          ? "bg-surface-2 text-ink rounded-[12px] px-3.5 py-2"
                          : msg.failed ? "text-red-500 py-2 pl-4" : "text-ink py-2 pl-4"
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {isAiTyping && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 text-[13px] text-ink-subtle py-2 pl-4">
                      <div className="scale-75 origin-left flex items-center justify-center">
                        <Lumidot variant={lumidotVariant} pattern="frame" glow={4} />
                      </div>
                      <span>{activeToolLabel ?? "Thinking..."}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input Section */}
              <div className="px-2 pb-2 shrink-0">
                <div className="relative rounded-[8px] border border-border bg-surface-1">

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
                                i === slashSelectedIndex ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2/50"
                              }`}
                            >
                              <span className="flex items-center justify-center size-5 shrink-0 font-mono text-[13px] text-ink-subtle">/</span>
                              <div className="flex min-w-0 flex-col">
                                <span className="font-medium truncate">{cmd.label}</span>
                                <span className="text-[11px] text-ink-subtle truncate">{cmd.command} — {cmd.description}</span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-4 text-center text-[12px] text-ink-subtle">
                            No commands for this page
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
                          Array.from(new Set(filteredOptions.map(o => o.type))).map(type => (
                            <div key={type} className="flex flex-col">
                              <div className="px-3 py-1.5 text-[11px] font-medium text-ink-subtle">
                                {type}
                              </div>
                              {filteredOptions.filter(o => o.type === type).map((opt) => {
                                const i = filteredOptions.findIndex(o => o.id === opt.id);
                                return (
                                  <button
                                    key={opt.id}
                                    onClick={() => insertMention(opt)}
                                    onMouseEnter={() => setSelectedIndex(i)}
                                    className={`flex items-center gap-2.5 w-full text-left px-3 py-1.5 mx-1.5 rounded-[6px] text-[13px] transition-colors w-[calc(100%-12px)] ${
                                      i === selectedIndex ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2/50"
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
                                      <span className="font-medium truncate">{opt.title}</span>
                                      {opt.description && (
                                        <span className="text-[12px] text-ink-subtle truncate">{opt.description}</span>
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

                  <div className="flex flex-wrap items-center gap-1.5 w-full min-h-[38px] max-h-[120px] bg-transparent px-2 py-1.5 overflow-y-auto">
                    {ambientContextDisplay && (
                      <div
                        aria-label="Active page context"
                        title={`${ambientContextDisplay.pageLabel}: ${ambientContextDisplay.title}`}
                        className="group flex min-w-0 max-w-full items-center gap-1.5 rounded-[8px] bg-surface-2 px-2 py-1 text-[13px] font-medium text-ink ring-1 ring-border"
                      >
                        <span className="relative flex size-4 shrink-0 items-center justify-center rounded-full bg-[#34c759]/10 ring-1 ring-[#34c759]/20">
                          <span className="size-2 rounded-full bg-[#34c759]" />
                        </span>
                        <span className="shrink-0 text-[12px] text-ink-muted">{ambientContextDisplay.pageLabel}</span>
                        <span className="min-w-0 truncate">{ambientContextDisplay.title}</span>
                        {ambientContextDisplay.status && (
                          <span className="shrink-0 rounded-[6px] bg-surface-1 px-1.5 py-0.5 text-[11px] font-medium text-ink-subtle ring-1 ring-border">
                            {ambientContextDisplay.status}
                          </span>
                        )}
                      </div>
                    )}
                    {selectedContexts.map(ctx => (
                      <div
                        key={ctx.id}
                        className="flex items-center gap-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-1.5 py-0.5 rounded-md text-[12px] font-medium cursor-pointer transition-colors"
                        onClick={() => {
                          // Handle redirect or logic here
                          console.log("Redirect to:", ctx.link);
                        }}
                      >
                        {ctx.isAvatar ? (
                          <div className="flex items-center justify-center size-3.5 rounded-full shrink-0 text-[7px] font-bold text-white bg-ink">
                            {ctx.icon}
                          </div>
                        ) : (
                          <span className="flex items-center justify-center size-3.5 shrink-0">
                            {ctx.icon}
                          </span>
                        )}
                        {ctx.title}
                      </div>
                    ))}
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={handleInput}
                      onKeyDown={handleKeyDown}
                      placeholder={selectedContexts.length > 0 ? "" : ambientContextDisplay ? "Ask with page context..." : "Ask WarpTalk..."}
                      className="flex-1 min-w-[120px] bg-transparent resize-none outline-none text-[13px] text-ink placeholder:text-ink-subtle self-stretch"
                      rows={1}
                    />
                  </div>

                  <div className="flex items-center justify-between px-1.5 pb-1.5">
                    <Popover open={skillsMenuOpen} onOpenChange={setSkillsMenuOpen}>
                      <PopoverTrigger className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors text-[12px] font-medium">
                        <Cube weight="regular" size={14} />
                        Skills
                        <CaretDown weight="bold" size={10} className="text-ink-subtle ml-0.5" />
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="top"
                        sideOffset={8}
                        className="p-1.5 w-[260px] bg-surface-1 border border-border shadow-xl rounded-xl"
                      >
                        {skills && skills.length > 0 ? (
                          <div className="flex flex-col">
                            {skills.map((skill) => (
                              <div
                                key={skill.name}
                                className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md hover:bg-surface-2 transition-colors"
                              >
                                <span className="text-[12px] font-medium text-ink">{skill.label}</span>
                                <span className="text-[11px] text-ink-subtle">{skill.description}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-2.5 py-3 text-center text-[12px] text-ink-subtle">
                            Loading skills…
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>

                    <div className="flex items-center gap-1">
                      <button className="flex items-center justify-center size-7 rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors">
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 2C5.567 2 4 3.567 4 5.5v5a2.5 2.5 0 0 0 5 0v-4.5a1 1 0 0 0-2 0V10.5a.5.5 0 0 1-1 0v-5a1.5 1.5 0 0 1 3 0v5a3.5 3.5 0 0 1-7 0v-5A4.5 4.5 0 0 1 12 5.5v4.5a1 1 0 0 1-2 0V5.5A2.5 2.5 0 0 0 7.5 2Z"/></svg>
                      </button>
                      <button
                        onClick={() => sendMessage()}
                        disabled={!inputValue.trim()}
                        className="flex items-center justify-center size-[26px] rounded-full bg-ink text-surface-1 hover:bg-ink-muted disabled:opacity-50 disabled:bg-surface-2 disabled:text-ink-muted transition-colors ml-1"
                      >
                        <ArrowUp weight="bold" size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <button
            className="flex items-center justify-center size-[26px] rounded-[6px] text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
            title="Chat history"
          >
            <ClockCounterClockwise weight="regular" size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
