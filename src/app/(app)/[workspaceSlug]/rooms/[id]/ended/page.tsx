import Link from "next/link";
import { CheckCircle, FileText, ChatCircleText, ArrowClockwise, Star } from "@phosphor-icons/react/dist/ssr";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const jobs = [
  { label: "Transcript finalizing", status: "Completed", icon: CheckCircle },
  { label: "AI summary generating", status: "Processing", icon: ArrowClockwise },
  { label: "Action items extraction", status: "Queued", icon: ChatCircleText },
  { label: "Artifact permissions", status: "Ready", icon: FileText },
];

export default async function RoomEndedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = await params;

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Meeting ended</CardTitle>
          <CardDescription>WarpTalk is preparing transcript, summary, and review artifacts for this room.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {jobs.map((job) => (
            <div key={job.label} className="rounded-2xl border bg-white p-4">
              <job.icon className="mb-3 h-5 w-5 text-neutral-950" />
              <p className="font-medium">{job.label}</p>
              <p className="text-sm text-neutral-500">{job.status}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`/${params.workspaceSlug}/rooms/${roomId}/artifacts`} className="inline-flex h-8 items-center justify-center rounded-full bg-neutral-950 px-3 text-sm font-medium text-white transition hover:bg-neutral-800">Open artifacts</Link>
        <Link href="/feedback" className="inline-flex h-8 items-center justify-center rounded-full border border-border  px-3 text-sm font-medium transition hover:bg-muted"><Star weight="light" className="mr-2 h-4 w-4" />Submit feedback</Link>
        <Link href="/history" className="inline-flex h-8 items-center justify-center rounded-full border border-border  px-3 text-sm font-medium transition hover:bg-muted">View history</Link>
      </div>
    </div>
  );
}
