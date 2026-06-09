"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, ArrowSquareOut, Funnel, Translate, MagnifyingGlass, VideoCamera } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { workspaceRooms } from "@/lib/workspace-preview";

const statusStyles: Record<string, string> = {
  "In progress": "border-emerald-200 bg-emerald-50 text-emerald-700",
  Scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  "Setup needed": "border-amber-200 bg-amber-50 text-amber-700",
  Completed: "border-neutral-200 bg-neutral-100 text-neutral-600",
};

export default function WorkspaceRoomsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [department, setDepartment] = useState("All");
  const [page, setPage] = useState(1);
  const pageSize = 4;

  const departments = [...new Set(workspaceRooms.map((room) => room.department))];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return workspaceRooms.filter((room) => {
      const matchesQuery = !normalized || [room.name, room.id, room.host].some((value) => value.toLowerCase().includes(normalized));
      return matchesQuery && (status === "All" || room.status === status) && (department === "All" || room.department === department);
    });
  }, [query, status, department]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize);

  return (
    <div className="flex min-h-full flex-col gap-3 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspace rooms</h1>
          <p className="text-sm text-muted-foreground">Company-wide meeting visibility using the same room records as the Host workspace.</p>
        </div>
        <Link href="/rooms/create" className={buttonVariants({ className: "rounded-full bg-neutral-950 text-white hover:bg-neutral-800" })}>Create room</Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Summary label="Meeting now" value={workspaceRooms.filter((room) => room.status === "In progress").length} />
        <Summary label="Upcoming" value={workspaceRooms.filter((room) => room.status === "Scheduled").length} />
        <Summary label="Setup required" value={workspaceRooms.filter((room) => room.status === "Setup needed").length} />
      </section>

      <Card className="min-h-0 flex-1 overflow-hidden rounded-3xl border-white/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-3">
          <div>
            <CardTitle className="text-base">All meetings</CardTitle>
            <p className="text-xs text-muted-foreground">{filtered.length} rooms visible to workspace managers.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <MagnifyingGlass weight="light" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="MagnifyingGlass rooms..." className="h-9 rounded-xl bg-white pl-9" />
            </div>
            <Select value={department} onValueChange={(value) => { setDepartment(value ?? "All"); setPage(1); }}>
              <SelectTrigger className="h-9 w-40 rounded-xl bg-white"><Funnel weight="light" /><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="All">All departments</SelectItem>{departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => { setStatus(value ?? "All"); setPage(1); }}>
              <SelectTrigger className="h-9 w-36 rounded-xl bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["All", "In progress", "Scheduled", "Setup needed", "Completed"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="flex h-[calc(100%-69px)] flex-col p-0">
          <div className="grid grid-cols-[52px_minmax(210px,1.2fr)_150px_minmax(210px,1fr)_145px_90px_42px] gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>No.</span><span>Room</span><span>Status</span><span>Translate</span><span>Starts</span><span>People</span><span />
          </div>
          <div className="flex-1">
            {rows.map((room, index) => (
              <div key={room.id} className="grid grid-cols-[52px_minmax(210px,1.2fr)_150px_minmax(210px,1fr)_145px_90px_42px] items-center gap-3 border-b px-4 py-3">
                <span className="text-sm text-muted-foreground">{(page - 1) * pageSize + index + 1}</span>
                <div className="min-w-0"><p className="truncate text-sm font-medium">{room.name}</p><p className="text-xs text-muted-foreground">{room.id} · {room.department}</p></div>
                <Badge variant="outline" className={`w-fit rounded-full ${statusStyles[room.status]}`}>{room.status}</Badge>
                <p className="flex min-w-0 items-center gap-2 truncate text-sm text-muted-foreground"><Translate weight="light" className="h-4 w-4 shrink-0" />{room.languages}</p>
                <div><p className="text-sm">{room.startsAt}</p><p className="text-xs text-muted-foreground">{room.host}</p></div>
                <span className="text-sm">{room.participants}</span>
                <Link
                  href={room.id === "WARP-241" ? "/rooms/preview-investor-qa" : "/rooms/preview-partner-sync"}
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                  title="Open room information"
                >
                  <ArrowSquareOut weight="light" />
                </Link>
              </div>
            ))}
            {rows.length === 0 && <div className="p-16 text-center text-sm text-muted-foreground">No meetings match the selected filters.</div>}
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">Showing {rows.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}</p>
            <div className="flex items-center gap-1 rounded-2xl border bg-white p-1">
              <Button variant="ghost" size="icon-sm" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><CaretLeft weight="light" /></Button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
                <Button key={item} size="icon-sm" variant={item === page ? "default" : "ghost"} className={item === page ? "rounded-lg bg-neutral-950 text-white" : "rounded-lg"} onClick={() => setPage(item)}>{item}</Button>
              ))}
              <Button variant="ghost" size="icon-sm" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><CaretRight weight="light" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <Card className="rounded-3xl border-white/70 bg-white/88">
      <CardContent className="flex items-center justify-between p-4">
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-950 text-white"><VideoCamera weight="light" className="h-4 w-4" /></div>
      </CardContent>
    </Card>
  );
}
