"use client";

import { useMemo, useState } from "react";
import { EnvelopeSimple, MagnifyingGlass, ShieldCheck, Trash, UserCheck, Users } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { workspaceMembers, type WorkspaceMember, type WorkspaceMemberRole } from "@/lib/workspace-preview";

const roles: WorkspaceMemberRole[] = ["Owner", "Manager", "Host", "Member"];

export default function WorkspaceMembersPage() {
  const [members, setMembers] = useState<WorkspaceMember[]>(workspaceMembers);
  const [query, setQuery] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceMemberRole>("Member");
  const seatLimit = 160;

  const visibleMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) =>
      [member.name, member.email, member.department, member.role].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [members, query]);

  function inviteMember() {
    const email = inviteEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid company email address.");
      return;
    }
    if (members.some((member) => member.email.toLowerCase() === email.toLowerCase())) {
      toast.error("This email already belongs to the workspace.");
      return;
    }
    setMembers((current) => [
      ...current,
      {
        id: Date.now(),
        name: email.split("@")[0].replace(/[._-]/g, " "),
        email,
        role: inviteRole,
        department: "Unassigned",
        status: "Invited",
        lastActive: "Invitation sent",
      },
    ]);
    setInviteEmail("");
    toast.success(`Invitation sent to ${email}.`);
  }

  function updateRole(id: number, role: WorkspaceMemberRole) {
    setMembers((current) => current.map((member) => (member.id === id ? { ...member, role } : member)));
    toast.success("Member permission updated.");
  }

  function removeMember(id: number) {
    const member = members.find((item) => item.id === id);
    if (!member || member.role === "Owner") return;
    setMembers((current) => current.filter((item) => item.id !== id));
    toast.success(`${member.name} was removed from the workspace.`);
  }

  const activeMembers = members.filter((member) => member.status === "Active").length;
  const hosts = members.filter((member) => member.role === "Host").length;
  const pending = members.filter((member) => member.status === "Invited").length;

  return (
    <div className="flex min-h-full flex-col gap-3 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members & access</h1>
          <p className="text-sm text-muted-foreground">Invite Enterprise members and control who can host or manage the workspace.</p>
        </div>
        <Badge variant="outline" className="rounded-full bg-white px-3 py-1.5">{members.length} / {seatLimit} seats</Badge>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <StatCard icon={UserCheck} label="Active members" value={activeMembers} />
        <StatCard icon={ShieldCheck} label="Meeting hosts" value={hosts} />
        <StatCard icon={EnvelopeSimple} label="Pending invites" value={pending} />
      </section>

      <Card className="rounded-3xl border-white/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Invite a workspace member</CardTitle>
          <div className="flex flex-col gap-2 pt-2 md:flex-row">
            <Input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && inviteMember()}
              placeholder="name@company.com"
              className="h-10 flex-1 rounded-xl bg-white"
            />
            <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as WorkspaceMemberRole)}>
              <SelectTrigger className="h-10 w-full rounded-xl bg-white md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.filter((role) => role !== "Owner").map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={inviteMember} className="h-10 rounded-xl bg-neutral-950 px-5 text-white hover:bg-neutral-800">
              <EnvelopeSimple weight="light" /> Send invitation
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="min-h-0 flex-1 overflow-hidden rounded-3xl border-white/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-3">
          <div>
            <CardTitle className="text-base">Workspace directory</CardTitle>
            <p className="text-xs text-muted-foreground">Role changes apply to dashboard and meeting permissions.</p>
          </div>
          <div className="relative w-64">
            <MagnifyingGlass weight="light" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="MagnifyingGlass members..." className="h-9 rounded-xl bg-white pl-9" />
          </div>
        </CardHeader>
        <CardContent className="max-h-[430px] overflow-y-auto p-0">
          {visibleMembers.map((member) => (
            <div key={member.id} className="grid grid-cols-[minmax(220px,1.3fr)_minmax(130px,.65fr)_150px_115px_40px] items-center gap-3 border-b px-4 py-3 last:border-b-0">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 border">
                  <AvatarFallback className="bg-neutral-950 text-xs text-white">{initials(member.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium capitalize">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
              </div>
              <div>
                <p className="text-sm">{member.department}</p>
                <p className="text-xs text-muted-foreground">{member.lastActive}</p>
              </div>
              <Select value={member.role} onValueChange={(value) => updateRole(member.id, value as WorkspaceMemberRole)} disabled={member.role === "Owner"}>
                <SelectTrigger className="h-8 w-full rounded-lg bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
              </Select>
              <Badge variant={member.status === "Active" ? "secondary" : "outline"} className="w-fit rounded-full">{member.status}</Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={member.role === "Owner"}
                onClick={() => removeMember(member.id)}
                title="Remove member"
              >
                <Trash weight="light" className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {visibleMembers.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground">No members match this search.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card className="rounded-3xl border-white/70 bg-white/88">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white"><Icon className="h-5 w-5" /></div>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>
      </CardContent>
    </Card>
  );
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
