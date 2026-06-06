"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Bot,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  Plus,
  Reply,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MessageAttachment = {
  name: string;
  type: string;
  size: number;
};

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
  attachments?: MessageAttachment[];
  replyTo?: {
    role: "assistant" | "user";
    content: string;
  };
};

type Conversation = {
  id: string;
  title: string;
  preview: string;
  time: string;
  messages: ChatMessage[];
  hidden?: boolean;
  context?: {
    meetingId: string;
    artifact?: string;
  };
};

const initialConversations: Conversation[] = [
  {
    id: "board-review",
    title: "Board review follow-ups",
    preview: "Three follow-ups were identified...",
    time: "Now",
    messages: [
      {
        role: "assistant",
        content: "Ask me about recent rooms, transcript decisions, or translation quality patterns.",
      },
      {
        role: "user",
        content: "What changed after the board review session?",
      },
      {
        role: "assistant",
        content: "The preview data shows three follow-ups: rollout risks, investor Q&A, and terminology cleanup.",
      },
    ],
  },
  {
    id: "weekly-actions",
    title: "Weekly action items",
    preview: "Summarize action items from this week",
    time: "10:24",
    messages: [
      {
        role: "user",
        content: "Summarize action items from this week.",
      },
      {
        role: "assistant",
        content: "The main actions are preparing the Japanese glossary, sharing the onboarding deck, and reviewing rollout risks.",
      },
    ],
  },
  {
    id: "terminology",
    title: "Terminology cleanup",
    preview: "Which rooms need terminology cleanup?",
    time: "Yesterday",
    messages: [
      {
        role: "user",
        content: "Which rooms need terminology cleanup?",
      },
      {
        role: "assistant",
        content: "Board Review Translation and Legal Review Session contain terms that should be reviewed before the next export.",
      },
    ],
  },
  {
    id: "translation-confidence",
    title: "Translation confidence",
    preview: "Find sessions with low confidence",
    time: "Jun 05",
    messages: [
      {
        role: "user",
        content: "Show sessions with low translation confidence.",
      },
      {
        role: "assistant",
        content: "Two preview sessions contain low-confidence segments: Customer Onboarding and Partner Sync Room.",
      },
    ],
  },
  {
    id: "participant-summary",
    title: "Participant summary",
    preview: "Who joined the investor meeting?",
    time: "Jun 04",
    messages: [
      {
        role: "user",
        content: "Who joined the investor meeting?",
      },
      {
        role: "assistant",
        content: "The retained participant list includes the host, Mika Tanaka, Nguyen Linh, and the interpreter bot.",
      },
    ],
  },
];

const CHAT_STORAGE_KEY = "warptalk-ai-chat-v1";

export default function AiChatPage() {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversations[0].id);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (showHidden ? !conversation.hidden : conversation.hidden) return false;
      if (!normalizedQuery) return true;
      return [conversation.title, conversation.preview].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [conversations, query, showHidden]);

  const hiddenConversationCount = conversations.filter(
    (conversation) => conversation.hidden
  ).length;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          conversations?: Conversation[];
          activeId?: string;
        };
        if (parsed.conversations?.length) {
          setConversations(parsed.conversations);
          const savedActiveExists = parsed.conversations.some(
            (conversation) => conversation.id === parsed.activeId
          );
          setActiveId(
            savedActiveExists
              ? (parsed.activeId as string)
              : parsed.conversations[0].id
          );
        }
      }
    } catch {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify({ conversations, activeId })
    );
  }, [activeId, conversations, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const params = new URLSearchParams(window.location.search);
    const meetingId = params.get("meetingId");
    if (!meetingId) return;

    const artifact = params.get("artifact") ?? undefined;
    const linkedId = `meeting-context-${meetingId}`;
    setConversations((current) => {
      if (current.some((conversation) => conversation.id === linkedId)) return current;
      return [
        {
          id: linkedId,
          title: `Meeting analysis: ${meetingId.replaceAll("-", " ")}`,
          preview: `Context linked from ${artifact ?? "meeting artifacts"}`,
          time: "Now",
          context: { meetingId, artifact },
          messages: [
            {
              role: "assistant",
              content: `Meeting context "${meetingId}" is attached${artifact ? ` using ${artifact}` : ""}. What would you like to analyze?`,
            },
          ],
        },
        ...current,
      ];
    });
    setActiveId(linkedId);
  }, [storageReady]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [activeConversation.messages]);

  function sendMessage() {
    const content = draft.trim();
    if (!content && pendingFiles.length === 0) return;

    const attachments = pendingFiles.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    }));
    const preview = content || `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`;

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              preview,
              time: "Now",
              messages: [
                ...conversation.messages,
                {
                  role: "user",
                  content: content || "Attached files for analysis.",
                  attachments,
                  replyTo: replyTarget
                    ? {
                        role: replyTarget.role,
                        content: replyTarget.content,
                      }
                    : undefined,
                },
                {
                  role: "assistant",
                  content:
                    attachments.length > 0
                      ? `I received ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}. File analysis will connect when the AI retrieval backend is ready.`
                      : "Preview response: AI chat will connect to meeting context once backend retrieval is ready.",
                },
              ],
            }
          : conversation
      )
    );
    setDraft("");
    setReplyTarget(null);
    setPendingFiles([]);
    [imageInputRef, documentInputRef, audioInputRef].forEach((ref) => {
      if (ref.current) ref.current.value = "";
    });
  }

  function createConversation() {
    const id = `new-chat-${Date.now()}`;
    const conversation: Conversation = {
      id,
      title: "New conversation",
      preview: "Start a conversation with WarpTalk AI",
      time: "Now",
      messages: [
        {
          role: "assistant",
          content: "What would you like to know about your meetings?",
        },
      ],
    };

    setConversations((current) => [conversation, ...current]);
    setActiveId(id);
    setDraft("");
    setReplyTarget(null);
    setPendingFiles([]);
    setQuery("");
  }

  function deleteConversation(conversationId = activeId) {
    const deletedConversation = conversations.find(
      (conversation) => conversation.id === conversationId
    );
    if (!deletedConversation) return;

    const remaining = conversations.filter(
      (conversation) => conversation.id !== conversationId
    );

    if (remaining.length === 0) {
      const id = `new-chat-${Date.now()}`;
      const replacement: Conversation = {
        id,
        title: "New conversation",
        preview: "Start a conversation with WarpTalk AI",
        time: "Now",
        messages: [
          {
            role: "assistant",
            content: "What would you like to know about your meetings?",
          },
        ],
      };
      setConversations([replacement]);
      setActiveId(id);
    } else {
      setConversations(remaining);
      if (conversationId === activeId) {
        const nextVisible =
          remaining.find((conversation) => !conversation.hidden) ?? remaining[0];
        setActiveId(nextVisible.id);
      }
    }

    setDraft("");
    setReplyTarget(null);
    setPendingFiles([]);
    toast.success(`Deleted "${deletedConversation.title}".`);
  }

  function setConversationHidden(conversationId: string, hidden: boolean) {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const updated = conversations.map((item) =>
      item.id === conversationId ? { ...item, hidden } : item
    );

    if (hidden && conversationId === activeId) {
      const nextVisible = updated.find((item) => !item.hidden);
      if (nextVisible) {
        setActiveId(nextVisible.id);
      } else {
        const id = `new-chat-${Date.now()}`;
        const replacement: Conversation = {
          id,
          title: "New conversation",
          preview: "Start a conversation with WarpTalk AI",
          time: "Now",
          messages: [
            {
              role: "assistant",
              content: "What would you like to know about your meetings?",
            },
          ],
        };
        setConversations([...updated, replacement]);
        setActiveId(id);
        toast.success(`Hidden "${conversation.title}".`);
        return;
      }
    }

    setConversations(updated);
    toast.success(
      hidden
        ? `Hidden "${conversation.title}".`
        : `Restored "${conversation.title}".`
    );
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;

    const acceptedFiles = selectedFiles.filter((file) => file.size <= 10 * 1024 * 1024);
    const rejectedCount = selectedFiles.length - acceptedFiles.length;

    setPendingFiles((current) => {
      const knownFiles = new Set(current.map((file) => `${file.name}-${file.size}`));
      return [
        ...current,
        ...acceptedFiles.filter((file) => !knownFiles.has(`${file.name}-${file.size}`)),
      ].slice(0, 6);
    });

    if (rejectedCount > 0) {
      toast.error("Files larger than 10 MB were not attached.");
    }
    event.currentTarget.value = "";
  }

  function removePendingFile(fileToRemove: File) {
    setPendingFiles((current) =>
      current.filter(
        (file) =>
          file.name !== fileToRemove.name ||
          file.size !== fileToRemove.size
      )
    );
  }

  async function copyMessage(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    toast.success("Message copied.");
  }

  function replyToMessage(message: ChatMessage) {
    setReplyTarget(message);
    setDraft("");
  }

  function askAboutMessage(message: ChatMessage) {
    setReplyTarget(message);
    setDraft(`Explain this in more detail: "${message.content}"`);
  }

  function deleteMessage(messageIndex: number) {
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== activeId) return conversation;
        const messages = conversation.messages.filter(
          (_, index) => index !== messageIndex
        );
        const lastMessage = messages.at(-1);
        return {
          ...conversation,
          messages,
          preview: lastMessage?.content ?? "Conversation is empty",
          time: "Now",
        };
      })
    );
    setReplyTarget(null);
    toast.success("Message deleted.");
  }

  return (
    <div className="grid h-full min-h-0 overflow-hidden gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
      <Card className="min-h-0 gap-0 overflow-hidden rounded-[24px] py-0 shadow-sm">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          <div className="flex min-w-0 flex-col justify-center">
            <CardTitle className="truncate text-sm">{activeConversation.title}</CardTitle>
            <CardDescription className="truncate text-xs">
              {activeConversation.context
                ? `Context: ${activeConversation.context.meetingId} · ${activeConversation.context.artifact ?? "meeting artifacts"}`
                : "WarpTalk meeting intelligence"}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="secondary">Preview</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Conversation options"
                  />
                }
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => deleteConversation()}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div
            ref={messageViewportRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5"
          >
            {activeConversation.messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  "group/message flex items-start gap-2.5",
                  message.role === "user" && "justify-end"
                )}
              >
                {message.role === "assistant" ? (
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                ) : null}
                <div className="max-w-[76%]">
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      message.role === "user"
                        ? "rounded-br-md bg-neutral-950 text-white"
                        : "rounded-bl-md border bg-white text-neutral-800"
                    )}
                  >
                    {message.replyTo ? (
                      <div
                        className={cn(
                          "mb-2 rounded-lg border-l-2 px-2.5 py-1.5 text-xs",
                          message.role === "user"
                            ? "border-white/70 bg-white/10 text-white/75"
                            : "border-neutral-400 bg-neutral-100 text-neutral-500"
                        )}
                      >
                        <p className="mb-0.5 font-medium">
                          Replying to {message.replyTo.role === "user" ? "you" : "WarpTalk AI"}
                        </p>
                        <p className="line-clamp-2">{message.replyTo.content}</p>
                      </div>
                    ) : null}
                    {message.content}
                    {message.attachments?.length ? (
                      <div className="mt-2 grid gap-1.5">
                        {message.attachments.map((attachment) => (
                          <div
                            key={`${attachment.name}-${attachment.size}`}
                            className={cn(
                              "flex max-w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                              message.role === "user" ? "bg-white/12" : "bg-neutral-100"
                            )}
                          >
                            {attachment.type.startsWith("image/") ? (
                              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                            ) : attachment.type.startsWith("audio/") ? (
                              <Mic className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="truncate">{attachment.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <MessageAction
                      title="Copy message"
                      onClick={() => void copyMessage(message)}
                    >
                      <Copy />
                    </MessageAction>
                    <MessageAction
                      title="Reply to message"
                      onClick={() => replyToMessage(message)}
                    >
                      <Reply />
                    </MessageAction>
                    <MessageAction
                      title="Ask a follow-up"
                      onClick={() => askAboutMessage(message)}
                    >
                      <Sparkles />
                    </MessageAction>
                    <MessageAction
                      title="Delete message"
                      onClick={() => deleteMessage(index)}
                      destructive
                    >
                      <Trash2 />
                    </MessageAction>
                  </div>
                </div>
                {message.role === "user" ? (
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                    <User className="h-4 w-4" />
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t bg-white/90 p-3">
            {replyTarget ? (
              <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border bg-neutral-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-neutral-700">
                    Replying to {replyTarget.role === "user" ? "your message" : "WarpTalk AI"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {replyTarget.content}
                  </p>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setReplyTarget(null)}
                  title="Cancel reply"
                >
                  <X />
                </Button>
              </div>
            ) : null}
            {pendingFiles.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pendingFiles.map((file) => (
                  <div
                    key={`${file.name}-${file.size}`}
                    className="flex max-w-[220px] items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-[11px]"
                  >
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                    ) : file.type.startsWith("audio/") ? (
                      <Mic className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(file)}
                      className="ml-0.5 shrink-0 rounded-full text-muted-foreground transition hover:text-foreground"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2 rounded-2xl border bg-white p-1.5 shadow-sm">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={selectFiles}
                className="hidden"
              />
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.ppt,.pptx"
                multiple
                onChange={selectFiles}
                className="hidden"
              />
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={selectFiles}
                className="hidden"
              />
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => imageInputRef.current?.click()}
                title="Attach images"
                className="shrink-0 rounded-lg"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => documentInputRef.current?.click()}
                title="Attach documents or PDF"
                className="shrink-0 rounded-lg"
              >
                <FileText className="h-4 w-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => audioInputRef.current?.click()}
                title="Attach voice or audio"
                className="shrink-0 rounded-lg"
              >
                <Mic className="h-4 w-4" />
              </Button>
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
                placeholder="Ask about meetings, transcripts, or summaries..."
                className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!draft.trim() && pendingFiles.length === 0}
                title="Send message"
                className="shrink-0 rounded-xl"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hidden min-h-0 gap-0 overflow-hidden rounded-[24px] py-0 shadow-sm xl:flex">
        <CardHeader className="shrink-0 space-y-3 border-b px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Conversations</CardTitle>
              <CardDescription className="text-xs">
                Your WarpTalk AI history
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              {hiddenConversationCount > 0 ? (
                <Button
                  size="icon-sm"
                  variant={showHidden ? "secondary" : "ghost"}
                  onClick={() => {
                    setShowHidden((current) => !current);
                    setQuery("");
                  }}
                  title={showHidden ? "Show active conversations" : "Show hidden conversations"}
                  className="relative rounded-full"
                >
                  {showHidden ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                  {!showHidden ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-950 px-1 text-[9px] text-white">
                      {hiddenConversationCount}
                    </span>
                  ) : null}
                </Button>
              ) : null}
              <Button
                size="icon-sm"
                onClick={createConversation}
                title="New conversation"
                className="rounded-full"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations..."
              className="h-9 pl-8 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          <div className="space-y-1">
            {filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group/conversation flex w-full items-center rounded-xl transition-colors",
                  activeId === conversation.id
                    ? "bg-neutral-950 text-white"
                    : "hover:bg-neutral-100"
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(conversation.id)}
                  className="flex min-w-0 flex-1 gap-2.5 px-2.5 py-2.5 text-left"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      activeId === conversation.id
                        ? "bg-white/12 text-white"
                        : "bg-neutral-100 text-neutral-700"
                    )}
                  >
                    <MessageSquareText className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">
                        {conversation.title}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[10px]",
                          activeId === conversation.id
                            ? "text-white/55"
                            : "text-muted-foreground"
                        )}
                      >
                        {conversation.time}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "mt-1 block truncate text-[11px]",
                        activeId === conversation.id
                          ? "text-white/65"
                          : "text-muted-foreground"
                      )}
                    >
                      {conversation.preview}
                    </span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Conversation actions"
                        className={cn(
                          "mr-2 shrink-0 opacity-0 transition-opacity group-hover/conversation:opacity-100 data-[popup-open]:opacity-100",
                          activeId === conversation.id &&
                            "text-white hover:bg-white/12 hover:text-white"
                        )}
                      />
                    }
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() =>
                        setConversationHidden(conversation.id, !conversation.hidden)
                      }
                    >
                      {conversation.hidden ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                      {conversation.hidden ? "Restore conversation" : "Hide conversation"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => deleteConversation(conversation.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete conversation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center text-muted-foreground">
                <Bot className="mb-2 h-5 w-5" />
                <p className="text-xs font-medium">
                  {showHidden ? "No hidden conversations" : "No conversations found"}
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>

        <div className="flex h-11 shrink-0 items-center gap-2 border-t px-3 text-[11px] text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          Conversations are saved on this device
        </div>
      </Card>
    </div>
  );
}

function MessageAction({
  title,
  onClick,
  destructive = false,
  children,
}: {
  title: string;
  onClick: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-neutral-100 hover:text-neutral-950 [&_svg]:h-3.5 [&_svg]:w-3.5",
        destructive && "hover:bg-red-50 hover:text-red-600"
      )}
    >
      {children}
    </button>
  );
}
