import { ArrowUpRight, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RolePlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  items: string[];
};

export function RolePlaceholderPage({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  items,
}: RolePlaceholderPageProps) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-2xl text-sm text-neutral-500">{description}</p>
        </div>
        <Badge variant="outline">Preview page</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planned capabilities</CardTitle>
          <CardDescription>This route is reserved so B2B navigation stays stable while backend contracts are completed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border bg-white p-4">
              <CheckCircle weight="light" className="mt-0.5 h-4 w-4 text-neutral-950" />
              <p className="text-sm text-neutral-600">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Link href={backHref} className="inline-flex h-8 w-fit items-center justify-center rounded-full bg-neutral-950 px-3 text-sm font-medium text-white transition hover:bg-neutral-800">
        {backLabel}
        <ArrowUpRight weight="light" className="ml-2 h-4 w-4" />
      </Link>
    </div>
  );
}
