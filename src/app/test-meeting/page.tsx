"use client";

import React, { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useConnectionState,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { TranscriptView } from "./TranscriptView";
import { useAuthStore } from "@/stores/auth-store";

export default function TestMeetingPage() {
  const authStoreToken = useAuthStore((state) => state.accessToken);
  const [jwtToken, setJwtToken] = useState("");
  const [roomId, setRoomId] = useState("019e3237-d685-7fbb-9156-cc889b4f12bc");
  const [lkToken, setLkToken] = useState("");
  const [wsUrl, setWsUrl] = useState("");
  const [status, setStatus] = useState("Setup"); // Setup -> Waiting -> Connected
  const [isHost, setIsHost] = useState(false);
  const [participantIdToAdmit, setParticipantIdToAdmit] = useState("");
  const currentToken = jwtToken.trim() || authStoreToken || "";

  const handleJoin = async () => {
    try {
      if (!roomId) {
        alert("Please enter a Translation Room ID");
        setStatus("Setup");
        return;
      }

      if (!currentToken) {
        alert("Sign in or paste a short-lived development token.");
        setStatus("Setup");
        return;
      }

      setStatus("Joining...");
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5200/api/v1").replace(/\/+$/, "");

      const res = await fetch(`${baseUrl}/meetings/rooms/${roomId}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
            const data = await res.json().catch(() => ({}));
            if (data.status === "WAITING") {
                setStatus("Waiting for Host...");
                return;
            }
        }
        alert("Failed to join: " + await res.text());
        setStatus("Setup");
        return;
      }

      const data = await res.json();
      setLkToken(data.token);
      setWsUrl("ws://localhost:7880"); // Hardcoded local livekit URL for testing
      setStatus("Connected");

      // AUTOMATICALLY TRIGGER AI WORKER
      try {
          await fetch(`${baseUrl}/meetings/rooms/${roomId}/trigger-ai`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ participantIdentity: data.participantIdentity })
          });
          console.log("AI trigger sent!");
      } catch (err) {
          console.error("Failed to trigger AI", err);
      }

    } catch {
      alert("Error joining meeting");
      setStatus("Setup");
    }
  };

  const handleAdmit = async () => {
    try {
        if (!currentToken) {
            alert("Sign in or paste a short-lived development token.");
            return;
        }

        const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5200/api/v1").replace(/\/+$/, "");
        const res = await fetch(`${baseUrl}/translation-rooms/${roomId}/participants/${participantIdToAdmit}/admit`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${currentToken}`,
            },
        });
        if (res.ok) alert("Admitted!");
        else alert("Failed to admit: " + await res.text());
    } catch {
        alert("Error admitting");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 font-sans selection:bg-blue-500/30">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent pb-1">
            WarpTalk Meeting Test
          </h1>
          <p className="text-slate-400 text-lg">Validate LiveKit WebRTC and SignalR AI translation pipeline.</p>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
            <h2 className="text-xl font-bold text-slate-200">Configuration</h2>

            <div className="space-y-2">
              <label className="text-sm text-slate-400 font-semibold uppercase tracking-wider">JWT Token</label>
              <textarea
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none h-28 font-mono text-slate-300"
                placeholder="Optional short-lived development token"
                value={jwtToken}
                onChange={(e) => setJwtToken(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Uses the current signed-in session when empty. Never commit credentials here.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-400 font-semibold uppercase tracking-wider">Translation Room ID</label>
              <input
                type="text"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono text-slate-300"
                placeholder="UUID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              />
            </div>

            {status !== "Connected" && (
                <button
                  onClick={handleJoin}
                  className="w-full py-4 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl font-bold text-base transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
                >
                  {status === "Setup" ? "Join Meeting" : status}
                </button>
            )}

            <div className="pt-6 border-t border-slate-800 space-y-4">
               <label className="flex items-center space-x-3 text-sm text-slate-300 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input type="checkbox" checked={isHost} onChange={(e) => setIsHost(e.target.checked)} className="peer appearance-none w-5 h-5 border-2 border-slate-600 rounded bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 transition-all cursor-pointer" />
                    <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span className="group-hover:text-white transition-colors">I am the Host</span>
               </label>

               {isHost && (
                   <div className="space-y-3 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                       <input
                         type="text"
                         className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                         placeholder="Participant ID to Admit"
                         value={participantIdToAdmit}
                         onChange={(e) => setParticipantIdToAdmit(e.target.value)}
                       />
                       <button onClick={handleAdmit} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]">
                           Admit User
                       </button>
                   </div>
               )}
            </div>
          </div>

          {/* Main Area */}
          <div className="col-span-1 lg:col-span-2 space-y-6 flex flex-col">

            {/* LiveKit Room */}
            <div className="flex-none bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none" />

                {status === "Connected" && lkToken ? (
                    <LiveKitRoom
                        video={true}
                        audio={true}
                        token={lkToken}
                        serverUrl={wsUrl}
                        data-lk-theme="default"
                        style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}
                    >
                        <VideoConference />
                        <RoomAudioRenderer />
                        <ConnectionStatus />
                    </LiveKitRoom>
                ) : (
                    <div className="text-slate-500/80 italic font-medium">LiveKit Audio/Video disconnected. Connect to enable media.</div>
                )}
            </div>

            {/* Transcript View */}
            <div className="flex-1 min-h-0">
               {status === "Connected" ? (
                   <TranscriptView roomId={roomId} token={currentToken} />
               ) : (
                   <div className="h-full border border-slate-800 rounded-3xl bg-slate-900/50 flex flex-col items-center justify-center text-slate-500/80 space-y-4">
                       <svg className="w-12 h-12 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                       </svg>
                       <span className="font-medium">Transcript will appear here once connected...</span>
                   </div>
               )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionStatus() {
  const state = useConnectionState();
  return <div className="absolute top-4 right-4 text-xs font-bold px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-slate-300 shadow-sm flex items-center space-x-2">
      <span className={`w-2 h-2 rounded-full ${state === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
      <span className="capitalize">{state}</span>
  </div>;
}
