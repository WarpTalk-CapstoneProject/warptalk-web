import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { useAuthStore } from "@/stores/auth-store";
import { useSendMeetingChat } from "@/hooks/use-meeting";
import { ChatMessageDto, ChatMentionDto } from "@/types/realtime";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { suggestion } from './mentions';

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef } from "react";

export function ChatPanel({ roomId }: { roomId: string }) {
  const messages = useTranslationRoomStore((state) => state.chatMessages);
  const user = useAuthStore((state) => state.user);
  const { mutate: sendMessageAPI } = useSendMeetingChat();
  const containerRef = useRef<HTMLDivElement>(null);

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
      handleKeyDown: (view, event) => {
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
    let hasWarpbotMention = false;

    // A simple recursive function to extract text and mentions
    const parseNode = (node: any) => {
      if (node.type === 'text') {
        textContent += node.text;
      } else if (node.type === 'mention') {
        const id = node.attrs.id;
        const label = node.attrs.label;
        textContent += `@${label}`;
        mentions.push({
          id,
          display: label,
          type: 'agent' // Assuming all mentions are agents for now based on our mock
        });
        if (id === 'bot-warpbot') {
          hasWarpbotMention = true;
        }
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

    sendMessageAPI({
      roomId,
      data: {
        originalText: trimmedText,
        originalLanguage: "en", // Simplified for now
        translationEnabled: true,
        mentions: mentions.length > 0 ? mentions : undefined,
      },
    });

    editor.commands.clearContent(true);
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar scroll-smooth">
        <AnimatePresence initial={false}>
          {messages.map((message: ChatMessageDto) => {
            const isMine = message.senderUserId === user?.id;
            const isAssistant = message.messageType === "assistant";
            
            return (
              <motion.div 
                key={`${message.id}-${message.createdAt}`} 
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 24 }}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] shadow-sm ${isMine ? "bg-ink text-white" : isAssistant ? "border border-brand-primary/20 bg-brand-primary/5 text-ink" : "border border-border bg-surface-1 text-ink"}`}>
                  <p className={`mb-0.5 text-[11px] font-medium ${isMine ? "text-ink-tertiary" : isAssistant ? "text-brand-primary" : "text-ink-subtle"}`}>
                    {message.senderDisplayName}
                  </p>
                  <p className="leading-relaxed whitespace-pre-wrap">{message.originalText}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <div className="p-3 bg-transparent">
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-1 transition-colors focus-within:border-brand-primary focus-within:shadow-sm [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-ink-subtle [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0">
          <EditorContent editor={editor} className="w-full flex-1" />
        </div>
      </div>
    </div>
  );
}
