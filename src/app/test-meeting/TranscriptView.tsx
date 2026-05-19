"use client";

import React, { useEffect, useState, useRef } from "react";
import * as signalR from "@microsoft/signalr";

export interface TranscriptSegmentDto {
  segmentId: string;
  speakerId: string;
  speakerName: string;
  originalText: string;
  originalLanguage: string;
  translatedText?: string;
  targetLanguage?: string;
  confidence: number;
  startTimeMs: number;
  endTimeMs: number;
}

interface TranscriptViewProps {
  roomId: string;
  token: string;
}

export function TranscriptView({ roomId, token }: TranscriptViewProps) {
  const [segments, setSegments] = useState<Record<string, TranscriptSegmentDto>>({});
  const [connectionState, setConnectionState] = useState<string>("Disconnected");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId || !token) return;

    const SIGNALR_BASE = process.env.NEXT_PUBLIC_SIGNALR_URL || "http://localhost:5200";
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${SIGNALR_BASE}/hubs/translation-room`, {
        accessTokenFactory: () => token,
      })
      .withAutomaticReconnect()
      .build();

    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegmentDto) => {
      setSegments((prev) => ({
        ...prev,
        [segment.segmentId]: segment, // Override with the latest version
      }));
    });

    const startConnection = async () => {
      try {
        setConnectionState("Connecting...");
        await connection.start();
        setConnectionState("Connected");
        
        // Let the server know we want transcripts in Vietnamese (example)
        await connection.invoke("JoinTranslationRoom", roomId, "Test User", "en", "vi");

      } catch (err) {
        console.error("SignalR Connection Error: ", err);
        setConnectionState("Failed");
      }
    };

    startConnection();

    return () => {
      connection.stop();
    };
  }, [roomId, token]);

  // Scroll to bottom when segments change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments]);

  const segmentList = Object.values(segments).sort((a, b) => a.startTimeMs - b.startTimeMs);

  return (
    <div className="flex flex-col h-full border rounded-2xl overflow-hidden bg-slate-900 border-slate-800 shadow-xl">
      <div className="bg-slate-950 p-4 text-sm font-medium flex justify-between items-center border-b border-slate-800">
        <span className="text-slate-300">Live AI Transcript & Translation</span>
        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${connectionState === "Connected" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
          {connectionState}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {segmentList.map((seg) => (
          <div key={seg.segmentId} className="flex flex-col space-y-1">
            <div className="flex items-baseline space-x-3">
              <span className="font-semibold text-sm text-indigo-400">{seg.speakerName}</span>
              <span className="text-xs text-slate-500">{new Date(seg.startTimeMs).toLocaleTimeString()}</span>
            </div>
            <p className="text-slate-200 text-[15px] leading-relaxed font-light">{seg.originalText}</p>
            {seg.translatedText && (
              <p className="text-amber-400/90 text-[15px] italic font-medium leading-relaxed">
                {seg.translatedText}
              </p>
            )}
          </div>
        ))}
        {segmentList.length === 0 && (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm italic">
            Waiting for someone to speak into the microphone...
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
