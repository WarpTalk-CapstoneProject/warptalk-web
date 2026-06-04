import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, Copy, Languages, ShieldCheck, Users, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RoomPreflightPage({ params }: { params: { id: string } }) {
  const roomId = params.id;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Room preflight</p>
          <h1 className="text-2xl font-semibold tracking-tight">Investor Q&A Translation</h1>
          <p className="text-sm text-neutral-500">Review room settings, invite participants, and enter setup before the meeting starts.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/rooms/${roomId}/setup`} className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-background px-3 text-sm font-medium transition hover:bg-muted">Open setup</Link>
          <Link href={`/rooms/${roomId}/waiting`} className="inline-flex h-8 items-center justify-center rounded-full bg-neutral-950 px-3 text-sm font-medium text-white transition hover:bg-neutral-800">Open waiting room</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={<Video />} label="Room status" value="Waiting" />
        <Metric icon={<Users />} label="Participants" value="7 / 24" />
        <Metric icon={<Languages />} label="Languages" value="EN -> VI, JA" />
        <Metric icon={<CalendarClock />} label="Scheduled" value="Today 12:30" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Host configuration</CardTitle>
            <CardDescription>Preview configuration saved from create-room flow.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {[
              ["Room code", "WARP-241"],
              ["Room type", "Scheduled group"],
              ["Recording", "Enabled"],
              ["AI summary", "Generate after meeting"],
              ["Waiting room", "Host approval required"],
              ["Retention", "30 days"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border bg-white p-4">
                <p className="text-sm text-neutral-500">{label}</p>
                <p className="mt-1 font-medium">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite link</CardTitle>
            <CardDescription>Share this preview invite with participants.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border bg-white p-3 font-mono text-sm text-neutral-600">
              /join?code=WARP-241
            </div>
            <Button className="w-full rounded-full" variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              Copy invite
            </Button>
            <div className="rounded-2xl bg-neutral-950 p-4 text-white">
              <ShieldCheck className="mb-2 h-5 w-5" />
              <p className="font-medium">Backend validation pending</p>
              <p className="mt-1 text-sm text-white/65">This page remains safe in preview mode without room APIs.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
        <p className="text-sm text-neutral-500">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
