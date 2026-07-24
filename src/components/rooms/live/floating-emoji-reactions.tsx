"use client";

import React, { useState, useEffect, useCallback } from "react";
import { HubConnection } from "@microsoft/signalr";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ALLOWED_REACTION_EMOJIS, REALTIME_TIMINGS, SIGNALR_EVENTS } from "@/constants/realtime";

interface FloatingEmoji {
  id: string;
  emoji: string;
  leftPercent: number;
}

interface FloatingEmojiReactionsProps {
  connection: HubConnection | null;
  roomId: string;
}

export function FloatingEmojiReactions({ connection, roomId }: FloatingEmojiReactionsProps) {
  const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const addEmoji = useCallback((emoji: string) => {
    const newEmoji: FloatingEmoji = {
      id: `${Date.now()}-${Math.random()}`,
      emoji,
      leftPercent: Math.floor(Math.random() * 30) + 65,
    };
    setEmojis((prev) => [...prev.slice(-REALTIME_TIMINGS.MAX_FLOATING_EMOJIS), newEmoji]);

    setTimeout(() => {
      setEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id));
    }, REALTIME_TIMINGS.FLOATING_EMOJI_DURATION_MS);
  }, []);

  useEffect(() => {
    if (!connection) return;

    const handleReaction = (userId: string, emoji: string) => {
      addEmoji(emoji);
    };

    connection.on(SIGNALR_EVENTS.REACTION_RECEIVED, handleReaction);

    return () => {
      connection.off(SIGNALR_EVENTS.REACTION_RECEIVED, handleReaction);
    };
  }, [connection, addEmoji]);

  const sendReaction = async (emoji: string) => {
    if (!connection) return;
    try {
      await connection.invoke("SendReaction", roomId, emoji);
      setPopoverOpen(false);
    } catch (err) {
      console.warn("Failed to send reaction:", err);
    }
  };

  return (
    <>
      {/* Floating Emojis Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {emojis.map((item) => (
          <div
            key={item.id}
            className="absolute bottom-16 text-3xl opacity-90 transition-opacity"
            style={{
              left: `${item.leftPercent}%`,
              animation: `floatUpAndFade ${REALTIME_TIMINGS.FLOATING_EMOJI_DURATION_MS}ms ease-out forwards`,
            }}
          >
            {item.emoji}
          </div>
        ))}
      </div>

      {/* CSS Animation Keyframes */}
      <style jsx global>{`
        @keyframes floatUpAndFade {
          0% {
            transform: translateY(0) scale(0.6) rotate(0deg);
            opacity: 0.2;
          }
          20% {
            transform: translateY(-40px) scale(1.2) rotate(-5deg);
            opacity: 1;
          }
          60% {
            transform: translateY(-160px) scale(1) rotate(5deg);
            opacity: 0.8;
          }
          100% {
            transform: translateY(-280px) scale(0.8) rotate(-10deg);
            opacity: 0;
          }
        }
      `}</style>

      {/* Reaction Control Button */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          className="flex items-center justify-center h-9 px-2.5 rounded-full hover:bg-surface-2 text-ink-muted hover:text-ink gap-1.5 transition-colors"
          title="Send Reaction"
        >
          <Smile className="h-4 w-4" />
          <span className="text-xs font-medium hidden sm:inline">React</span>
        </PopoverTrigger>
        <PopoverContent align="center" side="top" className="w-auto p-1.5 rounded-full shadow-lg border-hairline bg-surface-1/90 backdrop-blur-md">
          <div className="flex items-center gap-1">
            {ALLOWED_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="text-xl p-1.5 hover:scale-125 transition-transform rounded-full hover:bg-surface-2"
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
