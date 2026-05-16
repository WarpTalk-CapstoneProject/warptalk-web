"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, LogOut, Users, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSpeechCapture } from "@/hooks/use-speech-capture";
import { createHubConnection } from "@/lib/signalr";
import { toast } from "sonner";
import * as signalR from "@microsoft/signalr";

interface TranscriptSegment {
  segmentId: string;
  speakerId: string;
  speakerName: string;
  originalText: string;
  originalLanguage: string;
  translatedText?: string;
  targetLanguage?: string;
}

export default function TranslationRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: roomId } = use(params);
  
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  const { isRecording, error, toggleRecording } = useSpeechCapture({
    chunkDurationMs: 1000,
    onAudioChunk: (base64Audio, index) => {
      if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
        connectionRef.current.invoke("SendAudioChunk", roomId, base64Audio, index, "auto")
          .catch((err) => console.error("Error sending audio chunk:", err));
      }
    },
  });

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  useEffect(() => {
    // Initialize SignalR connection
    const connection = createHubConnection("/hubs/translationRoom");
    connectionRef.current = connection;

    connection.on("ParticipantJoined", (participant) => {
      setParticipants((prev) => [...prev, participant]);
      toast.success(`${participant.displayName} joined the room`);
    });

    connection.on("ParticipantLeft", (userId) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== userId));
    });

    connection.on("TranscriptSegmentReceived", (segment: TranscriptSegment) => {
      setSegments((prev) => {
        // Update existing segment if it exists
        const existing = prev.findIndex((s) => s.segmentId === segment.segmentId);
        if (existing !== -1) {
          const newSegments = [...prev];
          newSegments[existing] = { ...newSegments[existing], ...segment };
          return newSegments;
        }
        // Add new segment
        return [...prev, segment];
      });
    });

    connection.on("TranslationTextReceived", (dto: any) => {
      setSegments((prev) => {
        const existing = prev.findIndex((s) => s.segmentId === dto.segmentId);
        if (existing !== -1) {
          const newSegments = [...prev];
          newSegments[existing] = { 
            ...newSegments[existing], 
            translatedText: dto.translatedText,
            targetLanguage: dto.targetLang
          };
          return newSegments;
        }
        return prev;
      });
    });

    connection.start()
      .then(() => {
        setIsConnected(true);
        // Join the room
        return connection.invoke("JoinTranslationRoom", roomId, "Demo User", "en", "vi");
      })
      .catch((err) => {
        console.error("SignalR Connection Error: ", err);
        toast.error("Failed to connect to the translation room.");
      });

    return () => {
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke("LeaveTranslationRoom", roomId).finally(() => {
          connection.stop();
        });
      } else {
        connection.stop();
      }
    };
  }, [roomId]);

  const handleLeave = () => {
    router.push("/dashboard");
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Translation Room</h1>
          <Badge variant={isConnected ? "default" : "destructive"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
          <span className="text-sm text-muted-foreground font-mono">{roomId}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleLeave}>
          <LogOut className="mr-2 h-4 w-4" />
          Leave Room
        </Button>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        {/* Participants Sidebar */}
        <aside className="w-64 border-r bg-muted/20 p-4 overflow-y-auto hidden md:block">
          <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-muted-foreground">
            <Users className="h-4 w-4" />
            Participants ({participants.length + 1})
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>ME</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">Demo User (You)</p>
                <p className="text-xs text-muted-foreground">en → vi</p>
              </div>
            </div>
            {participants.map((p) => (
              <div key={p.userId} className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{p.displayName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{p.displayName}</p>
                  <p className="text-xs text-muted-foreground">{p.speakLanguage} → {p.listenLanguage}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Transcript Area */}
        <section className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
          <Card className="flex-1 overflow-hidden flex flex-col shadow-sm border-muted">
            <CardHeader className="py-4 border-b bg-muted/10">
              <CardTitle className="text-lg font-medium flex items-center justify-between">
                <span>Live Transcript</span>
                <Button variant="ghost" size="icon">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-6">
              {segments.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No transcripts yet. Start speaking!
                </div>
              ) : (
                segments.map((seg) => (
                  <div key={seg.segmentId} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary">{seg.speakerName}</span>
                      <span className="text-xs text-muted-foreground uppercase">{seg.originalLanguage}</span>
                    </div>
                    <p className="text-base text-foreground leading-relaxed">
                      {seg.originalText}
                    </p>
                    {seg.translatedText && (
                      <p className="text-base text-muted-foreground italic border-l-2 pl-3 mt-1 border-primary/30">
                        {seg.translatedText}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Footer Controls */}
      <footer className="border-t bg-background p-4 flex items-center justify-center gap-4">
        <Button 
          variant={isRecording ? "destructive" : "default"} 
          size="lg" 
          className="rounded-full w-16 h-16 shadow-lg transition-all"
          onClick={toggleRecording}
          disabled={!isConnected}
        >
          {isRecording ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        </Button>
      </footer>
    </div>
  );
}
