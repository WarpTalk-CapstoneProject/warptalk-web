"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link as LinkIcon, Plus, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function MeetingActions() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const handleJoinMeeting = (event: FormEvent) => {
    event.preventDefault();
    const code = joinCode.trim();

    if (code) {
      router.push(`/join?code=${encodeURIComponent(code)}`);
      return;
    }

    router.push("/join");
  };

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
        <div className="absolute right-0 top-0 h-28 w-28 -translate-y-10 translate-x-10 rounded-full bg-primary/15 blur-2xl" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Video className="h-5 w-5" />
            </span>
            Start a translation room
          </CardTitle>
          <CardDescription>
            Open the room builder and preview the host setup flow without backend authentication.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="h-9" onClick={() => router.push("/rooms/create")}>
            <Plus className="mr-2 h-4 w-4" />
            Create room
          </Button>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border-border/80 bg-card shadow-sm">
        <div className="absolute bottom-0 right-0 h-28 w-28 translate-x-10 translate-y-10 rounded-full bg-muted blur-2xl" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-primary">
              <LinkIcon className="h-5 w-5" />
            </span>
            Join by room code
          </CardTitle>
          <CardDescription>
            Try the participant entry path with any meeting code while the backend is offline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinMeeting} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <Input
              type="text"
              placeholder="Enter meeting code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              className="bg-background"
            />
            <Button type="submit" variant="secondary">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
