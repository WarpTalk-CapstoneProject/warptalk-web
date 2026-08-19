"use client";

/**
 * The transcript panel the desktop app opens in its own small always-on-top window during an
 * external-bridge meeting.
 *
 * It is a separate route rather than a mode of the in-meeting panel because the user is not
 * looking at WarpTalk: they are in Google Meet, and this floats over it. That rules out the
 * meeting chrome entirely — no participant grid, no control bar, no navigation — and it means the
 * page has to be legible at 460px wide and from further away than a normal panel.
 *
 * The data is the same TranscriptSegmentReceived stream every other surface reads. Nothing about
 * an external-bridge room is special on the wire; the far side simply arrives as one speaker.
 */

import * as signalR from "@microsoft/signalr";
import { useEffect, useMemo, useRef, useState } from "react";
import { use } from "react";

import { useAuthStore } from "@/stores/auth-store";
import type { TranscriptSegmentDto } from "@/types/realtime";

type ConnectionState = "connecting" | "live" | "reconnecting" | "failed";

const STATE_LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  failed: "Disconnected",
};

export default function DesktopTranscriptPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [segments, setSegments] = useState<TranscriptSegmentDto[]>([]);
  const [state, setState] = useState<ConnectionState>("connecting");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId || !accessToken) return;

    const base = process.env.NEXT_PUBLIC_SIGNALR_URL;
    if (!base) {
      setState("failed");
      return;
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${base}/hubs/translation-room`, { accessTokenFactory: () => accessToken })
      .withAutomaticReconnect()
      .build();

    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegmentDto) => {
      setSegments((prev) => {
        // Segments are revised in place as recognition firms up, so replace rather than append.
        const index = prev.findIndex((existing) => existing.segmentId === segment.segmentId);
        if (index === -1) return [...prev, segment];
        const next = [...prev];
        next[index] = segment;
        return next;
      });
    });

    connection.onreconnecting(() => setState("reconnecting"));
    connection.onreconnected(() => setState("live"));
    connection.onclose(() => setState("failed"));

    connection
      .start()
      .then(() => setState("live"))
      .catch(() => setState("failed"));

    return () => {
      void connection.stop();
    };
  }, [roomId, accessToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments]);

  const hasContent = segments.length > 0;
  const statusTone = useMemo(
    () => (state === "live" ? "bg-emerald-400" : state === "failed" ? "bg-red-400" : "bg-amber-400"),
    [state],
  );

  return (
    <main className="flex h-[100dvh] flex-col bg-[#0b0b0c] text-white">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className={`size-2 rounded-full ${statusTone}`} aria-hidden />
        <span className="text-sm font-medium">Transcript</span>
        <span className="ml-auto text-xs text-white/45">{STATE_LABEL[state]}</span>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!accessToken && (
          <p className="text-sm text-white/50">Sign in to the WarpTalk window to see the transcript.</p>
        )}

        {accessToken && !hasContent && (
          <p className="text-sm text-white/50">
            Waiting for the first thing anyone says. Speak in your meeting and it will appear here.
          </p>
        )}

        {segments.map((segment) => {
          // Every translation the room produced, keyed by language. Which one to show is the
          // reader's choice everywhere else in the app; in a two-seat bridge room there is only
          // ever one, so showing whatever arrived avoids a language picker in a 460px window.
          const translation = segment.translations
            ? Object.values(segment.translations)[0]
            : segment.translatedText;

          return (
            <article key={segment.segmentId} className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-white/40">
                {segment.speakerName}
              </p>
              <p className="text-[15px] leading-snug text-white/90">{segment.originalText}</p>
              {translation && (
                <p className="border-l-2 border-white/15 pl-2 text-[15px] leading-snug text-white/60">
                  {translation}
                </p>
              )}
            </article>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </main>
  );
}
