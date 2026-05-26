import type { ReactNode } from "react";
import { CalendarClock, CheckCircle2, FileText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const summaries = [
  {
    title: "Board Review Translation",
    date: "Today, 10:24 AM",
    model: "WarpTalk Summary",
    points: ["Confirmed rollout risks", "Clarified investor follow-up", "Assigned terminology cleanup"],
  },
  {
    title: "Product Demo Follow-up",
    date: "Yesterday, 4:12 PM",
    model: "Action Item Extractor",
    points: ["Send onboarding deck", "Prepare Japanese glossary", "Review Q3 support plan"],
  },
];

export default function AiSummariesPage() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-2 inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI workspace
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">AI Summaries & Notes</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Shadcn-style summary review surface with preview notes until backend AI artifacts are connected.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric icon={<FileText />} label="Summaries" value="12" />
        <Metric icon={<CheckCircle2 />} label="Action items" value="28" />
        <Metric icon={<CalendarClock />} label="This week" value="7" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {summaries.map((summary) => (
          <Card key={summary.title} className="shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{summary.title}</CardTitle>
                  <CardDescription>{summary.date}</CardDescription>
                </div>
                <Badge variant="secondary">{summary.model}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.points.map((point) => (
                <div key={point} className="flex gap-3 rounded-lg border bg-background p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
