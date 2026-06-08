import { Bell, Building2, Database, ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const settings = [
  { title: "Workspace identity", detail: "Branding, workspace name, and default locale.", icon: Building2 },
  { title: "Retention policy", detail: "Transcript, recording, and artifact retention defaults.", icon: Database },
  { title: "Security controls", detail: "Domain restrictions and approval requirements.", icon: ShieldCheck },
  { title: "Notifications", detail: "Meeting, invite, and artifact-ready alerts.", icon: Bell },
];

export default function WorkspaceSettingsPage() {
  return (
    <div className="grid h-full min-h-0 gap-2 overflow-hidden pb-1 md:grid-cols-2 xl:grid-cols-4">
      {settings.map(({ title, detail, icon: Icon }, index) => (
        <Card key={title} className="rounded-3xl border-white/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <CardContent className="flex h-full flex-col justify-between p-4">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-base font-semibold">{title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t pt-3">
              <span className="text-xs text-muted-foreground">{index === 0 ? "Profile" : "Enabled"}</span>
              <Switch defaultChecked={index !== 0} disabled={index === 0} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
