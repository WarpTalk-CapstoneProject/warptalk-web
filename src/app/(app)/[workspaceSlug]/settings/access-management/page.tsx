"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { useWorkspaceMembers, usePreviewWorkspaceMemberRoleChange, useApplyWorkspaceMemberRoleChange } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WorkspaceAccessManagementPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceRole();
  const membersData = useWorkspaceMembers(workspaceId ?? "", 1, 100).data?.items;
  const members = useMemo(() => membersData ?? [], [membersData]);
  const preview = usePreviewWorkspaceMemberRoleChange(workspaceId ?? "");
  const change = useApplyWorkspaceMemberRoleChange(workspaceId ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [toRole, setToRole] = useState<"Admin" | "Member">("Admin");
  const [confirmation, setConfirmation] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [promotionReady, setPromotionReady] = useState(false);
  const [receipt, setReceipt] = useState<{ auditId: string; oldRole: string; newRole: string; effectiveAt: string } | null>(null);

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) {
        setCooldownUntil(null);
        setPromotionReady(true);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const target = useMemo(() => members.find((m) => m.userId === selected), [members, selected]);
  if (!workspaceId || role !== "owner") return <div className="p-6">Only the workspace owner can manage access.</div>;

  const openPreview = async (userId: string, targetRole: "Admin" | "Member") => {
    setSelected(userId); setToRole(targetRole); setConfirmation(""); setCooldownUntil(null); setRemaining(0); setPromotionReady(targetRole === "Member");
    try {
      const result = await preview.mutateAsync({ userId, targetRole });
      if (targetRole === "Admin" && result.coolingOffUntil) {
        const serverCooldown = Date.parse(result.coolingOffUntil);
        if (Number.isFinite(serverCooldown)) setCooldownUntil(serverCooldown);
        else setPromotionReady(true);
      }
    }
    catch { toast.error("Preview is stale or unavailable. Reload members and try again."); setSelected(null); }
  };

  const apply = async () => {
    if (!target || confirmation.trim().toLowerCase() !== (target.email || target.fullName).trim().toLowerCase()) {
      toast.error("Type the target email or full name exactly to confirm."); return;
    }
    if (toRole === "Admin" && remaining > 0) { toast.error(`Promotion unlocks in ${remaining}s.`); return; }
    try {
      if (!preview.data?.previewToken) { toast.error("Preview token is missing. Reload and preview again."); return; }
      const result = await change.mutateAsync({ userId: target.userId, request: {
        targetRole: toRole,
        idempotencyKey: crypto.randomUUID(),
        previewToken: preview.data.previewToken,
        correlationId: crypto.randomUUID(),
      }});
      setReceipt({ auditId: result.auditId, oldRole: result.oldRole, newRole: result.newRole, effectiveAt: result.effectiveAt });
      toast.success("Role change applied for the next request/session.");
      setSelected(null); setConfirmation(""); setPromotionReady(false); setCooldownUntil(null);
    } catch { toast.error("Role change failed. Reload the preview and try again."); }
  };

  return <div className="space-y-6 p-6">
    <div><h1 className="text-2xl font-semibold">Manage access</h1><p className="text-muted-foreground">Owner-only role governance. Running meetings keep their session snapshot.</p></div>
    <Card><CardHeader><CardTitle>Governance summary</CardTitle></CardHeader><CardContent>Only Internal Admin/Member roles can change. External members remain fixed as Member. CanCreateMeetings is independent.</CardContent></Card>
    <Card><CardHeader><CardTitle>Active internal members</CardTitle></CardHeader><CardContent className="space-y-3">
      {members.filter((m) => m.membershipType.toLowerCase() === "internal" && m.roleName !== "Owner").map((member) => <div key={member.userId} className="flex items-center justify-between rounded border p-3"><div><div className="font-medium">{member.fullName}</div><div className="text-sm text-muted-foreground">{member.email} - {member.roleName} - Can create meetings: {member.canCreateMeetings ? "Yes" : "No"}</div></div><div className="flex gap-2">{member.roleName === "Member" && <Button variant="outline" onClick={() => openPreview(member.userId, "Admin")}>Preview promote</Button>}{member.roleName === "Admin" && <Button variant="outline" onClick={() => openPreview(member.userId, "Member")}>Preview demote</Button>}</div></div>)}
    </CardContent></Card>
    {selected && target && <Card><CardHeader><CardTitle>Review role change</CardTitle></CardHeader><CardContent className="space-y-3"><p>{target.fullName}: {target.roleName} to {toRole}</p><p className="text-sm">{toRole === "Admin" ? "Promotion has a 60-second cooling-off before final confirmation." : "Demotion applies to the next request/session."}</p><p className="text-xs text-muted-foreground">Preview expires {preview.data?.expiresAt ? new Date(preview.data.expiresAt).toLocaleString() : "soon"}.</p><ul className="list-disc pl-5 text-sm">{(preview.data?.impact ?? []).map((item) => <li key={item}>{item}</li>)}</ul><Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder={`Type ${target.email || target.fullName} to confirm`} /><div className="flex gap-2"><Button onClick={() => { if (toRole === "Admin" && !promotionReady) { if (!cooldownUntil) setCooldownUntil(Date.now() + 60000); } else apply(); }} disabled={change.isPending || confirmation.trim().toLowerCase() !== (target.email || target.fullName).trim().toLowerCase()}>{toRole === "Admin" && !promotionReady ? (remaining ? `Wait ${remaining}s` : "Start 60-second review") : "Confirm role change"}</Button><Button variant="ghost" onClick={() => { setSelected(null); setPromotionReady(false); setCooldownUntil(null); }}>Cancel</Button></div></CardContent></Card>}
    {receipt && <Card><CardHeader><CardTitle>Latest role-change receipt</CardTitle></CardHeader><CardContent className="space-y-1 text-sm"><p>{receipt.oldRole} to {receipt.newRole}</p><p>Effective: {new Date(receipt.effectiveAt).toLocaleString()} for the next request/session.</p><p className="text-xs text-muted-foreground">Event ID: {receipt.auditId}. Durable role-change history is not stored by Workspace in this schema-free flow.</p></CardContent></Card>}
  </div>;
}
