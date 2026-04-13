"use client";

import { useState, useCallback } from "react";
import * as signalR from "@microsoft/signalr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { createHubConnection } from "@/lib/signalr";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslationRoomStore } from "@/stores/translation-room-store";

import { authService } from "@/services/auth.service";
import { translationRoomService } from "@/services/translationRoom.service";
import { transcriptService } from "@/services/transcript.service";
import { notificationService } from "@/services/notification.service";

import type { AuthResponse } from "@/types/auth";
import type { TranslationRoomDto } from "@/types/translationRoom";
import type { TranscriptDto } from "@/types/transcript";
import type { NotificationPreferenceDto } from "@/types/notification";
import type {
  ParticipantInfoDto,
  TranscriptSegmentDto,
  ChatMessageDto,
  TranslationRoomStateDto,
} from "@/types/realtime";

// ─── Result log entry ─────────────────────────
interface LogEntry {
  id: number;
  time: string;
  section: string;
  action: string;
  status: "success" | "error" | "info";
  data?: unknown;
}

let logId = 0;

export default function DevTestPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [translationRoomHub, setTranslationRoomHub] =
    useState<signalR.HubConnection | null>(null);
  const [notifHub, setNotifHub] =
    useState<signalR.HubConnection | null>(null);

  // form fields
  const [email, setEmail] = useState("test@warptalk.dev");
  const [password, setPassword] = useState("Test@123456");
  const [fullName, setFullName] = useState("Test User");
  const [translationRoomId, setTranslationRoomId] = useState("");
  const [transcriptId, setTranscriptId] = useState("");

  const store = useAuthStore();
  const translationRoomStore = useTranslationRoomStore();

  const log = useCallback(
    (
      section: string,
      action: string,
      status: LogEntry["status"],
      data?: unknown
    ) => {
      setLogs((prev) => [
        {
          id: ++logId,
          time: new Date().toLocaleTimeString(),
          section,
          action,
          status,
          data,
        },
        ...prev.slice(0, 99),
      ]);
    },
    []
  );

  // ───────────────────────────── AUTH ─────────────────────────────
  const testRegister = async () => {
    try {
      const { data } = await authService.register({
        email,
        password,
        fullName,
      });
      store.login(data.user, data.accessToken, data.refreshToken);
      document.cookie = `access_token=${data.accessToken}; path=/; SameSite=Lax`;
      log("Auth", "Register", "success", data.user);
    } catch (e: unknown) {
      log("Auth", "Register", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testLogin = async () => {
    try {
      const { data } = await authService.login({ email, password });
      store.login(data.user, data.accessToken, data.refreshToken);
      document.cookie = `access_token=${data.accessToken}; path=/; SameSite=Lax`;
      log("Auth", "Login", "success", data.user);
    } catch (e: unknown) {
      log("Auth", "Login", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testProfile = async () => {
    try {
      const { data } = await authService.getProfile();
      log("Auth", "GET /auth/me", "success", data);
    } catch (e: unknown) {
      log("Auth", "GET /auth/me", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testUpdateProfile = async () => {
    try {
      const { data } = await authService.updateProfile({
        fullName: "Updated Name " + Date.now(),
      });
      store.updateUser(data);
      log("Auth", "PUT /auth/me", "success", data);
    } catch (e: unknown) {
      log("Auth", "PUT /auth/me", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testRefresh = async () => {
    try {
      const rt = store.refreshToken;
      if (!rt) throw new Error("No refresh token in store");
      const { data } = await authService.refresh(rt);
      store.setTokens(data.accessToken, data.refreshToken);
      log("Auth", "POST /auth/refresh", "success", {
        expiresAt: data.expiresAt,
      });
    } catch (e: unknown) {
      log("Auth", "POST /auth/refresh", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testLogout = async () => {
    try {
      const rt = store.refreshToken;
      if (rt) await authService.logout({ refreshToken: rt });
      store.logout();
      document.cookie =
        "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      log("Auth", "POST /auth/logout", "success");
    } catch (e: unknown) {
      log("Auth", "POST /auth/logout", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  // ───────────────────────────── MEETINGS ─────────────────────────
  const testCreateTranslationRoom = async () => {
    try {
      const { data } = await translationRoomService.create({
        title: "Test TranslationRoom " + Date.now(),
        translationRoomType: "group",
        maxParticipants: 10,
        sourceLanguage: "vi",
        targetLanguages: "en",
      });
      setTranslationRoomId(data.id);
      log("TranslationRoom", "POST /translationRooms", "success", data);
    } catch (e: unknown) {
      log("TranslationRoom", "POST /translationRooms", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testGetTranslationRoom = async () => {
    if (!translationRoomId) return log("TranslationRoom", "GET /translationRooms/:id", "error", "No translationRoom ID");
    try {
      const { data } = await translationRoomService.get(translationRoomId);
      log("TranslationRoom", `GET /translationRooms/${translationRoomId}`, "success", data);
    } catch (e: unknown) {
      log("TranslationRoom", "GET /translationRooms/:id", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testJoinTranslationRoom = async () => {
    if (!translationRoomId) return log("TranslationRoom", "JOIN", "error", "No translationRoom ID");
    try {
      const { data } = await translationRoomService.join(translationRoomId, {
        displayName: fullName,
        listenLanguage: "en",
        speakLanguage: "vi",
      });
      log("TranslationRoom", `POST /translationRooms/${translationRoomId}/join`, "success", data);
    } catch (e: unknown) {
      log("TranslationRoom", "JOIN", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testEndTranslationRoom = async () => {
    if (!translationRoomId) return log("TranslationRoom", "END", "error", "No translationRoom ID");
    try {
      await translationRoomService.end(translationRoomId);
      log("TranslationRoom", `POST /translationRooms/${translationRoomId}/end`, "success");
    } catch (e: unknown) {
      log("TranslationRoom", "END", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  // ───────────────────────────── TRANSCRIPTS ──────────────────────
  const testStartTranscript = async () => {
    if (!translationRoomId) return log("Transcript", "START", "error", "No translationRoom ID");
    try {
      const { data } = await transcriptService.start({
        translationRoomId,
        sourceLanguage: "vi",
      });
      setTranscriptId(data.id);
      log("Transcript", "POST /transcripts", "success", data);
    } catch (e: unknown) {
      log("Transcript", "START", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testGetTranscript = async () => {
    if (!transcriptId) return log("Transcript", "GET", "error", "No transcript ID");
    try {
      const { data } = await transcriptService.get(transcriptId);
      log("Transcript", `GET /transcripts/${transcriptId}`, "success", data);
    } catch (e: unknown) {
      log("Transcript", "GET", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testFinalizeTranscript = async () => {
    if (!transcriptId) return log("Transcript", "FINALIZE", "error", "No transcript ID");
    try {
      await transcriptService.finalize(transcriptId);
      log("Transcript", `POST /transcripts/${transcriptId}/finalize`, "success");
    } catch (e: unknown) {
      log("Transcript", "FINALIZE", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  // ───────────────────────────── NOTIFICATIONS ────────────────────
  const testGetPreferences = async () => {
    try {
      const { data } = await notificationService.getPreferences();
      log("Notification", "GET /notifications/preferences", "success", data);
    } catch (e: unknown) {
      log("Notification", "GET prefs", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  // ───────────────────────────── SIGNALR ──────────────────────────
  const connectTranslationRoomHub = async () => {
    try {
      if (translationRoomHub) {
        await translationRoomHub.stop();
        log("SignalR", "TranslationRoomHub", "info", "Disconnected previous connection");
      }
      const conn = createHubConnection("/hubs/translationRoom");

      conn.on("TranslationRoomStarted", (state: TranslationRoomStateDto) => {
        translationRoomStore.setTranslationRoomState(state);
        log("SignalR", "← TranslationRoomStarted", "info", state);
      });
      conn.on("ParticipantJoined", (p: ParticipantInfoDto) => {
        translationRoomStore.addParticipant(p);
        log("SignalR", "← ParticipantJoined", "info", p);
      });
      conn.on("ParticipantLeft", (userId: string) => {
        translationRoomStore.removeParticipant(userId);
        log("SignalR", "← ParticipantLeft", "info", userId);
      });
      conn.on("TranscriptSegmentReceived", (seg: TranscriptSegmentDto) => {
        translationRoomStore.addTranscriptSegment(seg);
        log("SignalR", "← TranscriptSegment", "info", seg);
      });
      conn.on("ChatMessageReceived", (msg: ChatMessageDto) => {
        translationRoomStore.addChatMessage(msg);
        log("SignalR", "← ChatMessage", "info", msg);
      });
      conn.on("TranslationRoomEnded", (translationRoomIdVal: string) => {
        log("SignalR", "← TranslationRoomEnded", "info", translationRoomIdVal);
      });

      conn.onreconnecting(() => log("SignalR", "TranslationRoomHub", "info", "Reconnecting..."));
      conn.onreconnected(() => log("SignalR", "TranslationRoomHub", "success", "Reconnected"));
      conn.onclose(() => log("SignalR", "TranslationRoomHub", "info", "Closed"));

      await conn.start();
      setTranslationRoomHub(conn);
      log("SignalR", "TranslationRoomHub Connect", "success", `State: ${conn.state}`);
    } catch (e: unknown) {
      log("SignalR", "TranslationRoomHub Connect", "error", String(e));
    }
  };

  const connectNotifHub = async () => {
    try {
      if (notifHub) {
        await notifHub.stop();
      }
      const conn = createHubConnection("/hubs/notification");

      conn.on("ReceiveNotification", (notif: unknown) => {
        log("SignalR", "← ReceiveNotification", "info", notif);
      });
      conn.on("NotificationRead", (id: string) => {
        log("SignalR", "← NotificationRead", "info", id);
      });

      await conn.start();
      setNotifHub(conn);
      log("SignalR", "NotifHub Connect", "success", `State: ${conn.state}`);
    } catch (e: unknown) {
      log("SignalR", "NotifHub Connect", "error", String(e));
    }
  };

  const hubJoinTranslationRoom = async () => {
    if (!translationRoomHub || !translationRoomId)
      return log("SignalR", "JoinTranslationRoom", "error", "No hub or translationRoom ID");
    try {
      await translationRoomHub.invoke("JoinTranslationRoom", translationRoomId, "vi", "en");
      log("SignalR", "→ JoinTranslationRoom", "success", translationRoomId);
    } catch (e: unknown) {
      log("SignalR", "→ JoinTranslationRoom", "error", String(e));
    }
  };

  const hubSendChat = async () => {
    if (!translationRoomHub || !translationRoomId) return;
    try {
      await translationRoomHub.invoke("SendChatMessage", translationRoomId, "Hello from test page!");
      log("SignalR", "→ SendChatMessage", "success");
    } catch (e: unknown) {
      log("SignalR", "→ SendChatMessage", "error", String(e));
    }
  };

  const hubToggleMute = async () => {
    if (!translationRoomHub || !translationRoomId) return;
    try {
      const newMuted = !translationRoomStore.isMuted;
      await translationRoomHub.invoke("ToggleMute", translationRoomId, newMuted);
      translationRoomStore.setMuted(newMuted);
      log("SignalR", "→ ToggleMute", "success", { muted: newMuted });
    } catch (e: unknown) {
      log("SignalR", "→ ToggleMute", "error", String(e));
    }
  };

  const disconnectAll = async () => {
    if (translationRoomHub) await translationRoomHub.stop();
    if (notifHub) await notifHub.stop();
    setTranslationRoomHub(null);
    setNotifHub(null);
    translationRoomStore.reset();
    log("SignalR", "Disconnect All", "success");
  };

  // ───────────────────────────── RAW ENDPOINT ─────────────────────
  const testRawEndpoint = async () => {
    const endpoint = prompt("Enter endpoint path (e.g. /auth/me):");
    if (!endpoint) return;
    try {
      const { data } = await apiClient.get(endpoint);
      log("Raw", `GET ${endpoint}`, "success", data);
    } catch (e: unknown) {
      log("Raw", `GET ${endpoint}`, "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  // ───────────────────────────── RENDER ───────────────────────────
  const statusColor = (s: LogEntry["status"]) =>
    s === "success" ? "bg-green-500" : s === "error" ? "bg-red-500" : "bg-blue-500";

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">🧪 WarpTalk Dev Test Page</h1>
      <p className="text-muted-foreground">
        Test all API services, SignalR hubs, and type mappings.
        Token: {store.accessToken ? "✅" : "❌"} | User:{" "}
        {store.user?.fullName ?? "none"}
      </p>

      {/* ── Credentials ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credentials</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} className="w-56" />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label>TranslationRoom ID</Label>
            <Input value={translationRoomId} onChange={(e) => setTranslationRoomId(e.target.value)} className="w-72" placeholder="auto-filled on create" />
          </div>
          <div className="space-y-1">
            <Label>Transcript ID</Label>
            <Input value={transcriptId} onChange={(e) => setTranscriptId(e.target.value)} className="w-72" placeholder="auto-filled on start" />
          </div>
        </CardContent>
      </Card>

      {/* ── Test Sections ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Auth */}
        <Card>
          <CardHeader><CardTitle className="text-base">🔐 Auth Service</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" onClick={testRegister}>Register</Button>
            <Button size="sm" onClick={testLogin}>Login</Button>
            <Button size="sm" onClick={testProfile}>Get Profile</Button>
            <Button size="sm" onClick={testUpdateProfile}>Update Profile</Button>
            <Button size="sm" onClick={testRefresh}>Refresh Token</Button>
            <Button size="sm" variant="destructive" onClick={testLogout}>Logout</Button>
          </CardContent>
        </Card>

        {/* TranslationRoom */}
        <Card>
          <CardHeader><CardTitle className="text-base">📹 TranslationRoom Service</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" onClick={testCreateTranslationRoom}>Create</Button>
            <Button size="sm" onClick={testGetTranslationRoom}>Get</Button>
            <Button size="sm" onClick={testJoinTranslationRoom}>Join</Button>
            <Button size="sm" variant="destructive" onClick={testEndTranslationRoom}>End</Button>
          </CardContent>
        </Card>

        {/* Transcript */}
        <Card>
          <CardHeader><CardTitle className="text-base">📝 Transcript Service</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" onClick={testStartTranscript}>Start</Button>
            <Button size="sm" onClick={testGetTranscript}>Get</Button>
            <Button size="sm" onClick={testFinalizeTranscript}>Finalize</Button>
          </CardContent>
        </Card>

        {/* Notification */}
        <Card>
          <CardHeader><CardTitle className="text-base">🔔 Notification Service</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" onClick={testGetPreferences}>Get Preferences</Button>
          </CardContent>
        </Card>

        {/* SignalR */}
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">⚡ SignalR Hubs</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={connectTranslationRoomHub}>
                Connect TranslationRoomHub {translationRoomHub?.state === "Connected" ? "🟢" : "⚪"}
              </Button>
              <Button size="sm" onClick={connectNotifHub}>
                Connect NotifHub {notifHub?.state === "Connected" ? "🟢" : "⚪"}
              </Button>
              <Separator orientation="vertical" className="h-8" />
              <Button size="sm" variant="outline" onClick={hubJoinTranslationRoom}>Hub: Join</Button>
              <Button size="sm" variant="outline" onClick={hubSendChat}>Hub: Chat</Button>
              <Button size="sm" variant="outline" onClick={hubToggleMute}>
                Hub: Mute ({translationRoomStore.isMuted ? "ON" : "OFF"})
              </Button>
              <Separator orientation="vertical" className="h-8" />
              <Button size="sm" variant="secondary" onClick={testRawEndpoint}>Raw GET...</Button>
              <Button size="sm" variant="destructive" onClick={disconnectAll}>Disconnect All</Button>
            </div>
            {translationRoomStore.participants.length > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                <strong>Participants:</strong> {translationRoomStore.participants.map((p) => p.displayName).join(", ")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Live Log ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">📋 Result Log</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => setLogs([])}>
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
            {logs.length === 0 && (
              <p className="text-muted-foreground">No results yet. Click a button above to test.</p>
            )}
            {logs.map((entry) => (
              <div key={entry.id} className="flex gap-2 border-b border-border/50 py-1">
                <span className="shrink-0 text-muted-foreground">{entry.time}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {entry.section}
                </Badge>
                <span className={`h-2 w-2 shrink-0 self-center rounded-full ${statusColor(entry.status)}`} />
                <span className="shrink-0 font-medium">{entry.action}</span>
                {entry.data != null && (
                  <span className="truncate text-muted-foreground">
                    {typeof entry.data === "string"
                      ? entry.data
                      : JSON.stringify(entry.data).slice(0, 200)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
