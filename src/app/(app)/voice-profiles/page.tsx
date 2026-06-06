import type { ReactNode } from "react";
import { AudioLines, Mic2, Radio, UserRoundCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const previewProfiles = [
  { name: "Host neutral", language: "English", status: "Default", usage: "Live rooms" },
  { name: "Vietnamese presenter", language: "Vietnamese", status: "Preview", usage: "Partner sessions" },
  { name: "Support voice", language: "English", status: "Draft", usage: "Review queue" },
];

export default function VoiceProfilesPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="flex justify-end">
        <Button className="w-fit rounded-full bg-neutral-950 px-5 text-white hover:bg-neutral-800">
          Create profile
        </Button>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric icon={<Mic2 />} label="Profiles" value="3" />
        <Metric icon={<Radio />} label="Room usage" value="12" />
        <Metric icon={<UserRoundCheck />} label="Ready voices" value="1" />
      </section>

      <Card className="min-h-0 flex-1 rounded-[24px]">
        <CardHeader>
          <CardTitle>Preview profiles</CardTitle>
          <CardDescription>
            This placeholder keeps configuration navigation inside the dashboard shell until voice APIs are connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {previewProfiles.map((profile) => (
            <div
              key={profile.name}
              className="flex flex-col gap-3 rounded-2xl border border-neutral-950/8 bg-white p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                  <AudioLines className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-neutral-950">{profile.name}</p>
                  <p className="text-sm text-neutral-500">{profile.language} · {profile.usage}</p>
                </div>
              </div>
              <Badge variant="outline" className="w-fit bg-white">
                {profile.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="rounded-[22px]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-neutral-950 text-white [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
          <Badge variant="outline" className="bg-white">Preview</Badge>
        </div>
        <p className="mt-4 text-sm text-neutral-500">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-neutral-950">{value}</p>
      </CardContent>
    </Card>
  );
}
