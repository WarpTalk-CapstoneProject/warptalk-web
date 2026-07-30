"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Waveform, Bug, CheckCircle, ClipboardText, Database, Broadcast, ArrowsClockwise, Terminal, Timer } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type LogEntry = {
  id: number;
  section: string;
  action: string;
  status: "ready" | "success" | "warning";
  time: string;
  payload: string;
};

const endpointGroups = [
  {
    section: "Rooms",
    endpoints: ["GET /translation-rooms", "POST /translation-rooms", "POST /translation-rooms/join"],
  },
  {
    section: "Transcripts",
    endpoints: ["GET /transcripts/:id", "POST /transcripts", "GET /transcripts/:id/artifacts"],
  },
  {
    section: "Realtime",
    endpoints: ["SignalR /hubs/translation-room", "SignalR /hubs/notifications"],
  },
  {
    section: "Feedback",
    endpoints: ["GET /translation-rooms/:id/feedback-state", "POST /translation-rooms/:id/feedback"],
  },
];

const initialLogs: LogEntry[] = [
  {
    id: 1,
    section: "Rooms",
    action: "Seed preview room",
    status: "success",
    time: "09:18",
    payload: "{ roomId: 'preview-room-001', status: 'ready' }",
  },
  {
    id: 2,
    section: "Realtime",
    action: "Mock hub handshake",
    status: "ready",
    time: "09:16",
    payload: "{ transport: 'websocket', mode: 'preview' }",
  },
];

export default function DevTestPage() {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [roomId, setRoomId] = useState("preview-room-001");
  const [transcriptId, setTranscriptId] = useState("transcript-preview-001");
  const [payload, setPayload] = useState(
    JSON.stringify(
      {
        title: "Product sync translation room",
        sourceLanguage: "vi",
        targetLanguages: ["en"],
        maxParticipants: 12,
      },
      null,
      2
    )
  );

  const health = useMemo(() => {
    const successCount = logs.filter((log) => log.status === "success").length;
    return {
      successCount,
      total: logs.length,
      lastRun: logs[0]?.time ?? "None",
    };
  }, [logs]);

  function addLog(section: string, action: string, status: LogEntry["status"], nextPayload: string) {
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setLogs((current) => [
      {
        id: Date.now(),
        section,
        action,
        status,
        time: now,
        payload: nextPayload,
      },
      ...current.slice(0, 9),
    ]);
  }

  function simulate(section: string, action: string) {
    addLog(
      section,
      action,
      "success",
      JSON.stringify({ roomId, transcriptId, preview: true, timestamp: new Date().toISOString() }, null, 2)
    );
  }

  function clearLogs() {
    setLogs([]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-primary">
            <Bug weight="light" className="h-4 w-4" />
            Developer console
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Dev test lab</h1>
          <p className="max-w-2xl text-muted-foreground">
            A shadcn API testing surface for previewing room, transcript, feedback, and realtime flows without requiring backend auth.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={clearLogs}>
            <ArrowsClockwise weight="light" className="mr-2 h-4 w-4" />
            Clear logs
          </Button>
          <Button onClick={() => simulate("Health", "Run preview diagnostics")}>
            <Waveform weight="light" className="mr-2 h-4 w-4" />
            Run diagnostics
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<CheckCircle weight="light" />} label="Successful checks" value={String(health.successCount)} detail={`${health.total} total logs`} />
        <MetricCard icon={<Timer weight="light" />} label="Last run" value={health.lastRun} detail="Local browser time" />
        <MetricCard icon={<Broadcast weight="light" />} label="Realtime mode" value="Mock" detail="SignalR preview" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Request setup</CardTitle>
            <CardDescription>Shared identifiers and payload for mock calls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Room ID">
              <Input value={roomId} onChange={(event) => setRoomId(event.target.value)} />
            </Field>
            <Field label="Transcript ID">
              <Input value={transcriptId} onChange={(event) => setTranscriptId(event.target.value)} />
            </Field>
            <Field label="Payload">
              <Textarea value={payload} onChange={(event) => setPayload(event.target.value)} className="min-h-44 font-mono text-xs" />
            </Field>
          </CardContent>
        </Card>

        <Tabs defaultValue="endpoints" className="space-y-4">
          <TabsList>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="endpoints">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Preview endpoint matrix</CardTitle>
                <CardDescription>Click actions to add simulated results to the log stream.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {endpointGroups.map((group) => (
                  <div key={group.section} className="rounded-lg border  p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Database weight="light" className="h-4 w-4 text-primary" />
                        <p className="font-medium">{group.section}</p>
                      </div>
                      <Badge variant="outline">{group.endpoints.length} routes</Badge>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {group.endpoints.map((endpoint) => (
                        <Button
                          key={endpoint}
                          variant="outline"
                          className="justify-start bg-card font-mono text-xs"
                          onClick={() => simulate(group.section, endpoint)}
                        >
                          <Terminal weight="light" className="mr-2 h-4 w-4" />
                          {endpoint}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Result log</CardTitle>
                <CardDescription>Recent preview calls and generated payloads.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{log.time}</TableCell>
                        <TableCell>{log.section}</TableCell>
                        <TableCell className="font-mono text-xs">{log.action}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={log.status === "success" ? "secondary" : "outline"}>{log.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!logs.length ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                          No preview logs yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </div>
          <ClipboardText weight="light" className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
