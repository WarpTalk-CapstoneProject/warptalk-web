"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Sparkle, ClockCounterClockwise, Question, ArrowsOutSimple, CornersIn, PaperPlaneRight, CaretUp, Plus, MagnifyingGlass, PaperPlaneTilt, Cube, CaretDown, FileText, Chats, BookBookmark } from "@phosphor-icons/react/dist/ssr";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useCreateAssistantConversation, useSendAssistantMessage } from "@/hooks/use-assistant";
import { createHubConnection } from "@/lib/signalr";
import type * as signalR from "@microsoft/signalr";
import { Lumidot } from "lumidot";
import { useTheme } from "next-themes";

const CONTEXT_OPTIONS = [
  { id: "this-page", title: "Current meeting context", type: "This page", icon: <FileText size={14} className="text-[#34c759]" />, description: "", link: "#" },
  { id: "all-transcripts", title: "All Transcripts", type: "Resources", icon: <Chats size={14} />, description: "Search transcripts", link: "/transcripts" },
  { id: "terminology", title: "Terminology", type: "Resources", icon: <BookBookmark size={14} />, description: "Search terminology", link: "/terminology" },
  { id: "user-1", title: "Noah Lopez", type: "Users", icon: "NL", isAvatar: true, description: "noah.lopez@...", link: "/user/noah" },
  { id: "user-2", title: "Nhi Ngô", type: "Users", icon: "NN", isAvatar: true, description: "hanhnhi10022005", link: "/user/nhi" },
];

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  context?: string;
  failed?: boolean;
}

export function GlobalChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedContexts, setSelectedContexts] = useState<typeof CONTEXT_OPTIONS>([]);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const user = useAuthStore((state) => state.user);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const createConversation = useCreateAssistantConversation();
  const sendAssistantMessage = useSendAssistantMessage();

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
      upsertAssistantMessage(payload.messageId, (prev) => ({
        id: payload.messageId,
        role: "assistant",
        content: prev?.content ?? "",
      }));
    });

    connection.on("AssistantMessageChunk", (payload: { conversationId: string; messageId: string; delta: string }) => {
      if (payload.conversationId !== conversationId) return;
      setIsAiTyping(false);
      upsertAssistantMessage(payload.messageId, (prev) => ({
        id: payload.messageId,
        role: "assistant",
        content: (prev?.content ?? "") + payload.delta,
      }));
    });

    connection.on("AssistantMessageCompleted", (payload: { conversationId: string; id: string; content: string }) => {
      if (payload.conversationId !== conversationId) return;
      setIsAiTyping(false);
      upsertAssistantMessage(payload.id, () => ({
        id: payload.id,
        role: "assistant",
        content: payload.content,
      }));
    });

    connection.on("AssistantMessageFailed", (payload: { conversationId: string; messageId: string; error: string }) => {
      if (payload.conversationId !== conversationId) return;
      setIsAiTyping(false);
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

  // Calculate mention menu position based on @ character
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  const sendMessage = async () => {
    const content = inputValue.trim();
    if (!content || !activeWorkspaceId) return;

    setInputValue("");
    setMentionMenuOpen(false);

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
      await sendAssistantMessage.mutateAsync({ conversationId: convId, content });
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
                      <span>Thinking...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input Section */}
              <div className="px-2 pb-2 shrink-0">
                <div className="relative rounded-[8px] border border-border bg-surface-1">

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
                                      <div className={`flex items-center justify-center size-5 rounded-full shrink-0 text-[9px] font-medium text-white ${opt.title === 'Nhi Ngô' ? 'bg-[#15bdf2]' : 'bg-ink'}`}>
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
                          <div className={`flex items-center justify-center size-3.5 rounded-full shrink-0 text-[7px] font-bold text-white ${ctx.title === 'Nhi Ngô' ? 'bg-[#15bdf2]' : 'bg-ink'}`}>
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
                      placeholder={selectedContexts.length > 0 ? "" : "Ask WarpTalk..."}
                      className="flex-1 min-w-[120px] bg-transparent resize-none outline-none text-[13px] text-ink placeholder:text-ink-subtle self-stretch"
                      rows={1}
                    />
                  </div>

                  <div className="flex items-center justify-between px-1.5 pb-1.5">
                    <button className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors text-[12px] font-medium">
                      <Cube weight="regular" size={14} />
                      Skills
                      <CaretDown weight="bold" size={10} className="text-ink-subtle ml-0.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      <button className="flex items-center justify-center size-7 rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors">
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 2C5.567 2 4 3.567 4 5.5v5a2.5 2.5 0 0 0 5 0v-4.5a1 1 0 0 0-2 0V10.5a.5.5 0 0 1-1 0v-5a1.5 1.5 0 0 1 3 0v5a3.5 3.5 0 0 1-7 0v-5A4.5 4.5 0 0 1 12 5.5v4.5a1 1 0 0 1-2 0V5.5A2.5 2.5 0 0 0 7.5 2Z"/></svg>
                      </button>
                      <button
                        onClick={sendMessage}
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
