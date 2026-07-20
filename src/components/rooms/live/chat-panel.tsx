import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { useAuthStore } from "@/stores/auth-store";
import { useMeetingChat, useSendMeetingChat } from "@/hooks/use-meeting";
import { ChatMessageDto, ChatMentionDto } from "@/types/realtime";
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { suggestion } from './mentions';
import { LoaderCircle, Send } from "lucide-react";
import { Lumidot } from "lumidot";
import { useTheme } from "next-themes";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";

export function ChatPanel({ roomId, sourceLanguage = "en" }: { roomId: string, sourceLanguage?: string }) {
  const messages = useTranslationRoomStore((state) => state.chatMessages);
  const participants = useTranslationRoomStore((state) => state.participants);
  const setChatMessages = useTranslationRoomStore((state) => state.setChatMessages);
  const addChatMessage = useTranslationRoomStore((state) => state.addChatMessage);
  const user = useAuthStore((state) => state.user);
  const historyQuery = useMeetingChat(roomId);
  const { mutate: sendMessageAPI, isPending } = useSendMeetingChat();
  const [sendError, setSendError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";

  useEffect(() => {
    if (historyQuery.data) {
      setChatMessages(historyQuery.data);
    }
  }, [historyQuery.data, setChatMessages]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: 'Type a message or @agent for AI help...',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'text-brand-primary font-medium bg-brand-primary/10 rounded px-1',
        },
        suggestion,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[36px] max-h-[120px] overflow-y-auto custom-scrollbar w-full bg-transparent text-[13px] text-ink outline-none px-3 py-2',
      },
      handleKeyDown: (view: any, event: any) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
          return true;
        }
        return false;
      },
    },
    content: '',
  });

  function sendMessage() {
    if (!editor) return;
    
    // Extract plain text and mentions
    const json = editor.getJSON();
    let textContent = '';
    const mentions: ChatMentionDto[] = [];

    // A simple recursive function to extract text and mentions
    const parseNode = (node: JSONContent) => {
      if (node.type === 'text') {
        textContent += node.text;
      } else if (node.type === 'mention') {
        const id = String(node.attrs?.id ?? "");
        const label = String(node.attrs?.label ?? "");
        textContent += `@${label}`;
        mentions.push({
          id,
          display: label,
          type: 'agent' // Assuming all mentions are agents for now based on our mock
        });
      } else if (node.type === 'hardBreak') {
        textContent += '\n';
      }
      
      if (node.content) {
        node.content.forEach(parseNode);
      }
    };

    if (json.content) {
      json.content.forEach((block: any) => {
        parseNode(block);
        textContent += '\n';
      });
    }

    const trimmedText = textContent.trim();
    if (!trimmedText) return;

    setSendError(null);
    sendMessageAPI(
      {
        roomId,
        data: {
          originalText: trimmedText,
          originalLanguage: sourceLanguage,
          translationEnabled: true,
          mentions: mentions.length > 0 ? mentions : undefined,
        },
      },
      {
        onSuccess: (message) => {
          addChatMessage(message);
          editor.commands.clearContent(true);
        },
        onError: () => {
          setSendError("Message could not be sent. Try again.");
        },
      }
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar scroll-smooth">
        {historyQuery.isLoading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-ink-subtle">
            <Lumidot variant={lumidotVariant} pattern="frame" glow={4} />
            <span className="ml-2">Loading messages</span>
          </div>
        ) : null}
        {historyQuery.isError && messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] font-medium text-ink">Could not load chat history</p>
            <button
              type="button"
              onClick={() => void historyQuery.refetch()}
              className="text-[12px] font-medium text-brand-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : null}
        {!historyQuery.isLoading && !historyQuery.isError && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-ink-subtle">
            No messages yet
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {messages.map((message: ChatMessageDto) => {
            const isMine = message.senderUserId === user?.id;
            const isAssistant = message.messageType === "assistant";
            
            let displayName = "";
            if (isMine && user) {
              displayName = user.fullName;
            } else if (isAssistant) {
              displayName = "WarpBot";
            } else {
              const senderParticipant = participants.find(p => p.userId === message.senderUserId || p.displayName === message.senderDisplayName || (p as any).providerIdentity === message.senderDisplayName);
              displayName = senderParticipant?.displayName || "User";
            }
            
            return (
              <motion.div 
                key={`${message.id}-${message.createdAt}`} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3 items-start group ${isMine ? "flex-row-reverse" : ""}`}
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold shadow-sm ${isAssistant ? "bg-brand-primary text-white" : isMine ? "bg-ink text-white" : "bg-surface-3 text-ink"}`}>
                  {displayName.substring(0, 2).toUpperCase()}
                </div>
                <div className={`flex min-w-0 flex-1 flex-col ${isMine ? "items-end" : "items-start"}`}>
                  <div className={`flex items-baseline gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                    <span className="text-[13px] font-semibold text-ink">{displayName}</span>
                    <span className="text-[11px] font-medium text-ink-subtle">
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className={`mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap ${isAssistant ? "text-brand-primary font-medium" : "text-ink-muted"} ${isMine ? "text-right" : "text-left"}`}>
                    {message.originalText}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <div className="p-3 bg-transparent">
        {sendError ? <p className="mb-2 text-[12px] text-red-600">{sendError}</p> : null}
        <div className="flex items-end gap-2 rounded-md border border-border bg-surface-1 p-1 transition-colors focus-within:border-brand-primary focus-within:shadow-sm [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-ink-subtle [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0">
          <EditorContent editor={editor} className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={sendMessage}
            disabled={isPending}
            aria-label="Send message"
            title="Send message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
