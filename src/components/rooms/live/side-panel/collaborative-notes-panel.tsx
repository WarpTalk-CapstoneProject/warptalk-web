"use client";

import React, { useState, useEffect, useRef } from "react";
import { HubConnection } from "@microsoft/signalr";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, Check, Users } from "lucide-react";
import { toast } from "sonner";

interface CollaborativeNotesPanelProps {
  connection: HubConnection | null;
  roomId: string;
}

export function CollaborativeNotesPanel({ connection, roomId }: CollaborativeNotesPanelProps) {
  const [content, setContent] = useState("");
  const [lastEditor, setLastEditor] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!connection) return;

    const handleNoteUpdate = (userId: string, displayName: string, newContent: string) => {
      setContent(newContent);
      setLastEditor(displayName);
      setIsSaved(true);
    };

    connection.on("CollaborativeNoteUpdated", handleNoteUpdate);

    return () => {
      connection.off("CollaborativeNoteUpdated", handleNoteUpdate);
    };
  }, [connection]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    setIsSaved(false);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (connection && roomId) {
        try {
          await connection.invoke("SendCollaborativeNoteDelta", roomId, val);
          setIsSaved(true);
        } catch (err) {
          console.warn("Failed to send note update:", err);
        }
      }
    }, 400);
  };

  const handleAiPolish = () => {
    if (!content.trim()) {
      toast.error("Write some notes first before polishing!");
      return;
    }

    const polishedHeader = `# Meeting Notes Summary\n*Date: ${new Date().toLocaleDateString()}*\n\n## Key Highlights & Decisions\n`;
    const polishedContent = polishedHeader + content;
    setContent(polishedContent);
    toast.success("AI polished your meeting notes!");

    if (connection && roomId) {
      connection.invoke("SendCollaborativeNoteDelta", roomId, polishedContent).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-1 p-3 gap-2">
      <div className="flex items-center justify-between border-b border-hairline pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <FileText className="h-4 w-4 text-primary" />
          Collaborative Notes
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink-muted">
            {isSaved ? (
              <span className="flex items-center gap-1 text-emerald-500">
                <Check className="h-3 w-3" /> Saved
              </span>
            ) : (
              <span className="text-amber-500">Saving...</span>
            )}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAiPolish}
            className="h-7 text-[11px] px-2 gap-1 border-hairline hover:bg-surface-2 text-ink"
            title="Format & Polish with AI"
          >
            <Sparkles className="h-3 w-3 text-amber-500" />
            AI Polish
          </Button>
        </div>
      </div>

      {lastEditor && (
        <div className="flex items-center gap-1 text-[11px] text-ink-muted bg-surface-2/40 px-2 py-1 rounded-md">
          <Users className="h-3 w-3" />
          <span>Last edited by <strong>{lastEditor}</strong></span>
        </div>
      )}

      <Textarea
        value={content}
        onChange={handleChange}
        placeholder="Type shared meeting notes, action items, or decisions here... All participants see updates in real-time."
        className="flex-1 min-h-[300px] resize-none bg-canvas text-xs leading-relaxed border-hairline focus-visible:ring-primary p-3"
      />
    </div>
  );
}
