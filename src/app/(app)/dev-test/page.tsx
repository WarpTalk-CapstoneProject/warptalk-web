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
import { useMeetingStore } from "@/stores/meeting-store";

import { authService } from "@/services/auth.service";
import { meetingService } from "@/services/meeting.service";
import { transcriptService } from "@/services/transcript.service";
import { notificationService } from "@/services/notification.service";

import type { AuthResponse } from "@/types/auth";
import type { MeetingDto } from "@/types/meeting";
import type { TranscriptDto } from "@/types/transcript";
import type { NotificationPreferenceDto } from "@/types/notification";
import type {
  ParticipantInfoDto,
  TranscriptSegmentDto,
  ChatMessageDto,
  MeetingStateDto,
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
  const [meetingHub, setMeetingHub] =
    useState<signalR.HubConnection | null>(null);
  const [notifHub, setNotifHub] =
    useState<signalR.HubConnection | null>(null);

  // form fields
  const [email, setEmail] = useState("test@warptalk.dev");
  const [password, setPassword] = useState("Test@123456");
  const [fullName, setFullName] = useState("Test User");
  const [meetingId, setMeetingId] = useState("");
  const [transcriptId, setTranscriptId] = useState("");

  const store = useAuthStore();
  const meetingStore = useMeetingStore();

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
  const testCreateMeeting = async () => {
    try {
      const { data } = await meetingService.create({
        title: "Test Meeting " + Date.now(),
        meetingType: "group",
        maxParticipants: 10,
        sourceLanguage: "vi",
        targetLanguages: "en",
      });
      setMeetingId(data.id);
      log("Meeting", "POST /meetings", "success", data);
    } catch (e: unknown) {
      log("Meeting", "POST /meetings", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testGetMeeting = async () => {
    if (!meetingId) return log("Meeting", "GET /meetings/:id", "error", "No meeting ID");
    try {
      const { data } = await meetingService.get(meetingId);
      log("Meeting", `GET /meetings/${meetingId}`, "success", data);
    } catch (e: unknown) {
      log("Meeting", "GET /meetings/:id", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testJoinMeeting = async () => {
    if (!meetingId) return log("Meeting", "JOIN", "error", "No meeting ID");
    try {
      const { data } = await meetingService.join(meetingId, {
        displayName: fullName,
        listenLanguage: "en",
        speakLanguage: "vi",
      });
      log("Meeting", `POST /meetings/${meetingId}/join`, "success", data);
    } catch (e: unknown) {
      log("Meeting", "JOIN", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  const testEndMeeting = async () => {
    if (!meetingId) return log("Meeting", "END", "error", "No meeting ID");
    try {
      await meetingService.end(meetingId);
      log("Meeting", `POST /meetings/${meetingId}/end`, "success");
    } catch (e: unknown) {
      log("Meeting", "END", "error", (e as { response?: { data?: unknown } })?.response?.data ?? String(e));
    }
  };

  // ───────────────────────────── TRANSCRIPTS ──────────────────────
  const testStartTranscript = async () => {
    if (!meetingId) return log("Transcript", "START", "error", "No meeting ID");
    try {
      const { data } = await transcriptService.start({
        meetingId,
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
  const connectMeetingHub = async () => {
    try {
      if (meetingHub) {
        await meetingHub.stop();
        log("SignalR", "MeetingHub", "info", "Disconnected previous connection");
      }
      const conn = createHubConnection("/hubs/meeting");

      conn.on("MeetingStarted", (state: MeetingStateDto) => {
        meetingStore.setMeetingState(state);
        log("SignalR", "← MeetingStarted", "info", state);
      });
      conn.on("ParticipantJoined", (p: ParticipantInfoDto) => {
        meetingStore.addParticipant(p);
        log("SignalR", "← ParticipantJoined", "info", p);
      });
      conn.on("ParticipantLeft", (userId: string) => {
        meetingStore.removeParticipant(userId);
        log("SignalR", "← ParticipantLeft", "info", userId);
      });
      conn.on("TranscriptSegmentReceived", (seg: TranscriptSegmentDto) => {
        meetingStore.addTranscriptSegment(seg);
        log("SignalR", "← TranscriptSegment", "info", seg);
      });
      conn.on("ChatMessageReceived", (msg: ChatMessageDto) => {
        meetingStore.addChatMessage(msg);
        log("SignalR", "← ChatMessage", "info", msg);
      });
      conn.on("MeetingEnded", (meetingIdVal: string) => {
        log("SignalR", "← MeetingEnded", "info", meetingIdVal);
      });

      conn.onreconnecting(() => log("SignalR", "MeetingHub", "info", "Reconnecting..."));
      conn.onreconnected(() => log("SignalR", "MeetingHub", "success", "Reconnected"));
      conn.onclose(() => log("SignalR", "MeetingHub", "info", "Closed"));

      await conn.start();
      setMeetingHub(conn);
      log("SignalR", "MeetingHub Connect", "success", `State: ${conn.state}`);
    } catch (e: unknown) {
      log("SignalR", "MeetingHub Connect", "error", String(e));
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

  const hubJoinMeeting = async () => {
    if (!meetingHub || !meetingId)
      return log("SignalR", "JoinMeeting", "error", "No hub or meeting ID");
    try {
      await meetingHub.invoke("JoinMeeting", meetingId, "vi", "en");
      log("SignalR", "→ JoinMeeting", "success", meetingId);
    } catch (e: unknown) {
      log("SignalR", "→ JoinMeeting", "error", String(e));
    }
  };

  const hubSendChat = async () => {
    if (!meetingHub || !meetingId) return;
    try {
      await meetingHub.invoke("SendChatMessage", meetingId, "Hello from test page!");
      log("SignalR", "→ SendChatMessage", "success");
    } catch (e: unknown) {
      log("SignalR", "→ SendChatMessage", "error", String(e));
    }
  };

  const hubToggleMute = async () => {
    if (!meetingHub || !meetingId) return;
    try {
      const newMuted = !meetingStore.isMuted;
      await meetingHub.invoke("ToggleMute", meetingId, newMuted);
      meetingStore.setMuted(newMuted);
      log("SignalR", "→ ToggleMute", "success", { muted: newMuted });
    } catch (e: unknown) {
      log("SignalR", "→ ToggleMute", "error", String(e));
    }
  };

  const disconnectAll = async () => {
    if (meetingHub) await meetingHub.stop();
    if (notifHub) await notifHub.stop();
    setMeetingHub(null);
    setNotifHub(null);
    meetingStore.reset();
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
            <Label>Meeting ID</Label>
            <Input value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className="w-72" placeholder="auto-filled on create" />
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

        {/* Meeting */}
        <Card>
          <CardHeader><CardTitle className="text-base">📹 Meeting Service</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" onClick={testCreateMeeting}>Create</Button>
            <Button size="sm" onClick={testGetMeeting}>Get</Button>
            <Button size="sm" onClick={testJoinMeeting}>Join</Button>
            <Button size="sm" variant="destructive" onClick={testEndMeeting}>End</Button>
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
              <Button size="sm" onClick={connectMeetingHub}>
                Connect MeetingHub {meetingHub?.state === "Connected" ? "🟢" : "⚪"}
              </Button>
              <Button size="sm" onClick={connectNotifHub}>
                Connect NotifHub {notifHub?.state === "Connected" ? "🟢" : "⚪"}
              </Button>
              <Separator orientation="vertical" className="h-8" />
              <Button size="sm" variant="outline" onClick={hubJoinMeeting}>Hub: Join</Button>
              <Button size="sm" variant="outline" onClick={hubSendChat}>Hub: Chat</Button>
              <Button size="sm" variant="outline" onClick={hubToggleMute}>
                Hub: Mute ({meetingStore.isMuted ? "ON" : "OFF"})
              </Button>
              <Separator orientation="vertical" className="h-8" />
              <Button size="sm" variant="secondary" onClick={testRawEndpoint}>Raw GET...</Button>
              <Button size="sm" variant="destructive" onClick={disconnectAll}>Disconnect All</Button>
            </div>
            {meetingStore.participants.length > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                <strong>Participants:</strong> {meetingStore.participants.map((p) => p.displayName).join(", ")}
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
