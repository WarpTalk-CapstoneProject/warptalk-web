"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { motion, AnimatePresence } from "motion/react";
import { Robot, MagicWand, Files, Info } from "@phosphor-icons/react/dist/ssr";
import { useAuthStore } from "@/stores/auth-store";

type BotMessage = {
  id: string;
  sender: "user" | "bot";
  text: string;
  isActionable?: boolean;
};

const initialBotMessages: BotMessage[] = [
  {
    id: "bot-greeting",
    sender: "bot",
    text: "Hi! I'm WarpBot. I'm actively analyzing this meeting in realtime. Ask me to:\n- Summarize the discussion so far\n- Catch you up on missed points\n- Search for specific terms in the transcript\n- Generate a draft of the meeting notes",
  }
];

export function WarpBotPanel() {
  const [messages, setMessages] = useState<BotMessage[]>(initialBotMessages);
  const containerRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((state) => state.user);
  
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, blockquote: false, codeBlock: false, horizontalRule: false }),
      Placeholder.configure({ placeholder: 'Ask WarpBot anything...' }),
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
    const textContent = editor.getText().trim();
    if (!textContent) return;

    const userMsg: BotMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: textContent,
    };

    setMessages((prev) => [...prev, userMsg]);
    editor.commands.clearContent(true);

    // Mock Bot Response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-reply-${Date.now()}`,
          sender: "bot",
          text: "I'm analyzing the transcript to answer your question. Since this is a preview, I don't have full context yet. Try asking me about 'terminologies' or 'rollout risks' based on the current discussion.",
        }
      ]);
    }, 1000);
  }

  function runQuickAction(action: string) {
    const userMsg: BotMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: action,
    };
    setMessages((prev) => [...prev, userMsg]);
    
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-reply-${Date.now()}`,
          sender: "bot",
          text: `Sure, running the action: "${action}". Based on the meeting so far, the team is discussing the glossary for the Japanese team and the terminology cleanup plan.`,
        }
      ]);
    }, 1500);
  }

  return (
    <div className="flex flex-col h-full bg-surface-1">
      {/* Bot Header Info */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-brand-primary/5 shrink-0">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-primary/20 text-brand-primary">
          <Robot className="h-5 w-5" weight="duotone" />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold text-ink leading-tight">WarpBot AI</h3>
          <p className="text-[11px] text-ink-subtle">Realtime Meeting Assistant</p>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar scroll-smooth">
        {messages.length === 1 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="flex flex-col gap-2 mb-4"
          >
            <p className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider mb-1">Suggested Actions</p>
            <QuickActionButton icon={<Files />} label="Summarize meeting" onClick={() => runQuickAction("Summarize the meeting")} />
            <QuickActionButton icon={<MagicWand />} label="Catch me up" onClick={() => runQuickAction("Catch me up on what I missed")} />
            <QuickActionButton icon={<Info />} label="Extract action items" onClick={() => runQuickAction("Extract action items")} />
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((message) => {
            const isUser = message.sender === "user";
            
            return (
              <motion.div 
                key={message.id}
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 24 }}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="mr-2 mt-1 shrink-0 grid h-6 w-6 place-items-center rounded-full bg-brand-primary/20 text-brand-primary">
                    <Robot className="h-3.5 w-3.5" weight="fill" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-[13px] shadow-sm ${isUser ? "bg-ink text-white" : "border border-brand-primary/20 bg-brand-primary/5 text-ink"}`}>
                  <p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="p-3 bg-transparent shrink-0">
        <div className="flex items-center gap-2 rounded-md border border-brand-primary/40 bg-surface-1 transition-colors focus-within:border-brand-primary focus-within:shadow-sm focus-within:ring-2 focus-within:ring-brand-primary/20 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-ink-subtle [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0">
          <EditorContent editor={editor} className="w-full flex-1" />
        </div>
        <p className="mt-2 text-center text-[10px] text-ink-tertiary">
          WarpBot can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

function QuickActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-left text-[12px] font-medium text-ink transition-colors hover:bg-surface-2 hover:border-brand-primary/30 group"
    >
      <span className="text-ink-subtle group-hover:text-brand-primary transition-colors">{icon}</span>
      {label}
    </button>
  );
}
