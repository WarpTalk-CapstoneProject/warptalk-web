import { Bell, KeyRound, Palette, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const settingsSections = [
  {
    icon: ShieldCheck,
    title: "Workspace access",
    description: "Review preview roles and security defaults before backend authentication is connected.",
    status: "Preview",
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "Configure room alerts, transcript status updates, and review queue reminders.",
    status: "Planned",
  },
  {
    icon: Palette,
    title: "Interface",
    description: "Keep the light shadcn dashboard shell consistent across host pages.",
    status: "Active",
  },
  {
    icon: KeyRound,
    title: "API readiness",
    description: "Track backend-dependent settings that will be enabled after service integration.",
    status: "Waiting",
  },
];

export default function SettingsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-neutral-950/8 bg-white px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Configuration
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Settings</h1>
          <p className="max-w-2xl text-sm text-neutral-600">
            Preview workspace controls without leaving the dashboard shell.
          </p>
        </div>
        <Button className="w-fit rounded-full bg-neutral-950 px-5 text-white hover:bg-neutral-800">
          Save preview
        </Button>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {settingsSections.map((section) => (
          <Card key={section.title} className="rounded-[22px]">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                  <section.icon className="h-4 w-4" />
                </span>
                <Badge variant="outline" className="bg-white">
                  {section.status}
                </Badge>
              </div>
              <div>
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card className="min-h-0 flex-1 rounded-[24px]">
        <CardHeader>
          <CardTitle>Implementation notes</CardTitle>
          <CardDescription>
            This page is intentionally available so sidebar navigation never routes users from a dashboard page into a missing page.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-neutral-600 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-950/8 bg-white p-4">
            <p className="font-medium text-neutral-950">Authentication</p>
            <p className="mt-1">Backend auth is not wired yet, so settings are preview-only.</p>
          </div>
          <div className="rounded-2xl border border-neutral-950/8 bg-white p-4">
            <p className="font-medium text-neutral-950">Navigation</p>
            <p className="mt-1">Chrome back/forward should keep the shared sidebar and active pill stable.</p>
          </div>
          <div className="rounded-2xl border border-neutral-950/8 bg-white p-4">
            <p className="font-medium text-neutral-950">Next step</p>
            <p className="mt-1">Replace preview cards with real workspace preferences when APIs are ready.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
