"use client";

import { useEffect } from "react";

export interface FloatingReaction {
  id: string;
  emoji: string;
}

/**
 * Floating emoji reactions — mounted once over the meeting stage, fed by
 * TranslationRoomHub's ReactionReceived event (broadcast to everyone including the
 * sender). Each bubble unmounts itself via onReactionExpired once its own animation
 * finishes, so rapid repeated clicks never leak DOM nodes. Respects
 * prefers-reduced-motion by fading in place instead of rising.
 */
export function ReactionOverlay({
  reactions,
  onReactionExpired,
}: {
  reactions: FloatingReaction[];
  onReactionExpired: (id: string) => void;
}) {
  if (!reactions.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <style>{`
        @keyframes warptalk-reaction-rise {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          12% { transform: translateY(-20px) scale(1); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(-240px) scale(1); opacity: 0; }
        }
        @keyframes warptalk-reaction-fade {
          0% { opacity: 0; }
          15% { opacity: 1; }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }
        .warptalk-reaction-bubble {
          animation: warptalk-reaction-rise 2.6s ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .warptalk-reaction-bubble {
            animation: warptalk-reaction-fade 2.6s ease-out forwards;
          }
        }
      `}</style>
      {reactions.map((reaction, index) => (
        <FloatingEmoji
          key={reaction.id}
          emoji={reaction.emoji}
          index={index}
          onDone={() => onReactionExpired(reaction.id)}
        />
      ))}
    </div>
  );
}

function FloatingEmoji({ emoji, index, onDone }: { emoji: string; index: number; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deterministic-ish horizontal spread so simultaneous reactions don't stack exactly.
  const left = 15 + ((index * 37) % 70);

  return (
    <span
      className="warptalk-reaction-bubble absolute bottom-6 select-none text-3xl drop-shadow"
      style={{ left: `${left}%` }}
    >
      {emoji}
    </span>
  );
}
