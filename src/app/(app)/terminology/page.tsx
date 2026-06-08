import type { ReactNode } from "react";
import { BookOpen, CheckCircle, Translate, Plus, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const terms = [
  {
    source: "rollout risk",
    target: "rui ro trien khai",
    language: "Vietnamese",
    status: "Approved",
    usage: "Investor rooms",
  },
  {
    source: "service-level agreement",
    target: "thoa thuan muc dich vu",
    language: "Vietnamese",
    status: "Review",
    usage: "Customer onboarding",
  },
  {
    source: "regulated document",
    target: "tai lieu duoc quan ly",
    language: "Vietnamese",
    status: "Approved",
    usage: "Legal review",
  },
  {
    source: "support coverage",
    target: "pham vi ho tro",
    language: "Vietnamese",
    status: "Draft",
    usage: "Product demo",
  },
];

export default function TerminologyPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex justify-end">
        <Button>
          <Plus weight="light" className="mr-2 h-4 w-4" />
          Add term
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric icon={<BookOpen weight="light" />} label="Glossary terms" value="124" detail="Preview workspace" />
        <Metric icon={<Translate weight="light" />} label="Translate" value="4" detail="Configured targets" />
        <Metric icon={<CheckCircle weight="light" />} label="Approved" value="89" detail="Ready for rooms" />
      </section>

      <Card>
        <CardHeader className="gap-4 border-b border-white/10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Workspace glossary</CardTitle>
            <CardDescription>Scan and review terms before they are used in a live room.</CardDescription>
          </div>
          <div className="relative w-full lg:w-[280px]">
            <MagnifyingGlass weight="light" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/42" />
            <Input placeholder="MagnifyingGlass terms..." className="pl-8" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4">
          {terms.map((term) => (
            <div key={term.source} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-medium text-white">{term.source}</p>
                  <p className="mt-1 text-sm text-white/56">{term.target}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{term.language}</Badge>
                  <Badge variant={term.status === "Approved" ? "default" : "secondary"}>{term.status}</Badge>
                </div>
              </div>
              <p className="mt-3 text-xs text-white/44">Used in: {term.usage}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-cyan-100 [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
          <Badge variant="outline">{detail}</Badge>
        </div>
        <p className="mt-4 text-sm text-white/58">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
