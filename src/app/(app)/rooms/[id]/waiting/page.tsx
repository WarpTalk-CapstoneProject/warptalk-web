import Link from "next/link";
import type { ReactNode } from "react";
import { Clock3, Copy, ShieldCheck, UserCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const participants = [
  { name: "Mai Nguyen", language: "Vietnamese to English", status: "Ready" },
  { name: "Jason Lee", language: "English to Vietnamese", status: "Waiting approval" },
  { name: "Yuki Tanaka", language: "Japanese to English", status: "Ready" },
];

export default function WaitingRoomPage({ params }: { params: { id: string } }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Waiting room</CardTitle>
              <CardDescription>Approve participants and confirm readiness before starting.</CardDescription>
            </div>
            <Badge variant="outline">WARP-241</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {participants.map((participant) => (
            <div key={participant.name} className="flex items-center justify-between rounded-2xl border bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-950 text-sm font-semibold text-white">
                  {participant.name.slice(0, 1)}
                </div>
                <div>
                  <p className="font-medium">{participant.name}</p>
                  <p className="text-sm text-neutral-500">{participant.language}</p>
                </div>
              </div>
              <Badge variant={participant.status === "Ready" ? "secondary" : "outline"}>{participant.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Host actions</CardTitle>
            <CardDescription>Move from waiting room into the live surface.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link href={`/room/${params.id}`} className="inline-flex h-8 items-center justify-center rounded-full bg-neutral-950 px-3 text-sm font-medium text-white transition hover:bg-neutral-800">Start meeting</Link>
            <Link href={`/rooms/${params.id}/setup`} className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-background px-3 text-sm font-medium transition hover:bg-muted">Back to setup</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Room signals</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Signal icon={<Users />} label="Participants" value="3 ready" />
            <Signal icon={<Clock3 />} label="Scheduled" value="Now" />
            <Signal icon={<UserCheck />} label="Approval" value="Required" />
            <Signal icon={<Copy />} label="Invite" value="/join?code=WARP-241" />
            <Signal icon={<ShieldCheck />} label="Backend" value="Preview fallback" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Signal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-white p-3 text-sm">
      <span className="flex items-center gap-2 text-neutral-600 [&_svg]:h-4 [&_svg]:w-4">{icon}{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
