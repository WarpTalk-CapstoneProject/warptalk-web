import { BookOpen, CheckCircle2, Languages, Upload } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

const glossaryItems = [
  { title: "Glossary import", detail: "Upload approved company terms for translation context.", icon: Upload },
  { title: "Language pairs", detail: "Prioritize Vietnamese, English, and Japanese terminology.", icon: Languages },
  { title: "Review workflow", detail: "Confirm transcript corrections before they become workspace terms.", icon: CheckCircle2 },
];

export default function WorkspaceTerminologyPage() {
  return (
    <div className="grid h-full min-h-0 gap-2 overflow-hidden pb-1 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="rounded-3xl border-white/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <CardContent className="grid gap-2 p-4 md:grid-cols-3">
          {glossaryItems.map(({ title, detail, icon: Icon }) => (
            <div key={title} className="rounded-2xl border bg-white p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-950 text-white">
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card
        className="workspace-dark-card rounded-3xl border-white/70 bg-neutral-950 text-white"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <CardContent className="flex h-full flex-col justify-between p-4">
          <BookOpen className="h-5 w-5" />
          <div>
            <p className="text-2xl font-semibold">342</p>
            <p className="text-sm text-white/65">approved workspace terms</p>
          </div>
          <p className="text-xs leading-5 text-white/55">Terms are available to meeting setup, live translation, transcript review, and workspace AI chat.</p>
        </CardContent>
      </Card>
    </div>
  );
}
