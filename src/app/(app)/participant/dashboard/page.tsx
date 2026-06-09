import type { ReactNode } from "react";
import { Calendar, Clock, FileText, Headphones, Translate, ChatCircleText } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { JoinByCodeDialog } from "./join-dialog";

const upcomingMeetings = [
  { title: "Partner Sync Room", code: "SYNC-882", time: "Today, 12:30 PM", language: "Vietnamese to English" },
  { title: "Customer Onboarding", code: "CUST-104", time: "Tomorrow, 09:00 AM", language: "English to Korean" },
];

const recentSummaries = [
  { title: "Board Review Translation", status: "Summary ready", artifacts: "Transcript, notes, action items" },
  { title: "Investor Q&A Translation", status: "Shared by host", artifacts: "Translated transcript" },
];

export default function ParticipantDashboardPage() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Participant workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight">Participant Dashboard</h1>
          <p className="text-sm text-neutral-500">Join meetings, review shared artifacts, and keep language preferences ready.</p>
        </div>
        <JoinByCodeDialog />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric icon={<Calendar weight="light" />} label="Upcoming invites" value="2" />
        <Metric icon={<FileText weight="light" />} label="Shared artifacts" value="8" />
        <Metric icon={<Translate weight="light" />} label="Default language" value="VI -> EN" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming meetings</CardTitle>
            <CardDescription>Preview participant schedule and setup entry points.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {upcomingMeetings.map((meeting) => (
              <div key={meeting.code} className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-4">
                <div>
                  <p className="font-medium">{meeting.title}</p>
                  <p className="text-sm text-neutral-500">{meeting.code} - {meeting.time} - {meeting.language}</p>
                </div>
                <Link href={`/rooms/${meeting.code.toLowerCase()}/setup`} className="inline-flex h-8 items-center justify-center rounded-full border border-border  px-3 text-sm font-medium transition hover:bg-muted">Setup</Link>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My meeting readiness</CardTitle>
            <CardDescription>Device and language checks before joining.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Readiness icon={<Headphones weight="light" />} label="Speaker" value="Ready" />
            <Readiness icon={<ChatCircleText weight="light" />} label="Captions" value="Translated" />
            <Readiness icon={<Clock weight="light" />} label="Last setup" value="2 hours ago" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent shared summaries</CardTitle>
          <CardDescription>Artifacts visible to this participant based on room permissions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {recentSummaries.map((summary) => (
            <div key={summary.title} className="rounded-2xl border bg-white p-4">
              <Badge variant="outline">{summary.status}</Badge>
              <p className="mt-3 font-medium">{summary.title}</p>
              <p className="text-sm text-neutral-500">{summary.artifacts}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </div>
        <p className="text-sm text-neutral-500">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Readiness({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-white p-3">
      <span className="flex items-center gap-2 text-sm text-neutral-600">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 text-neutral-950 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
