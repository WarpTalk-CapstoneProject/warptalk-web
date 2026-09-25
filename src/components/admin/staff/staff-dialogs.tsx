"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { InlineError, MIN_REASON_LENGTH, RoleChoiceList } from "@/components/admin/staff/staff-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useChangeStaffRole, useInviteStaff } from "@/hooks/use-admin-staff";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { canGrantRole } from "@/lib/admin/staff-permissions";
import { getErrorMessage } from "@/lib/api/errors";
import type { StaffMemberDto, StaffRoleDto } from "@/types/admin-staff";

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Invite by email. The server decides which of two things happens: an address that already has
 * an account gets staff access at once; one that does not gets an invitation that activates the
 * first time someone signs in with that address, verified. Either way the result says whether the
 * email went out, because the access stands even when the email does not.
 */
export function InviteStaffDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: readonly StaffRoleDto[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-lg">
        {open ? <InviteForm roles={roles} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ roles, onDone }: { roles: readonly StaffRoleDto[]; onDone: () => void }) {
  const t = useTranslations("adminStaff.invite");
  const { access } = useStaffAccess();
  const invite = useInviteStaff();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(trimmed)) {
      setError(t("invalidEmail"));
      return;
    }
    if (!roleId) {
      setError(t("chooseRole"));
      return;
    }
    try {
      setError(null);
      const result = await invite.mutateAsync({ email: trimmed, roleId, reason: note.trim() || undefined });
      const key = result.outcome === "granted" ? "granted" : "invited";
      toast.success(t(`${key}Toast`, { email: trimmed }), {
        description: result.emailSent ? undefined : t("emailNotSent"),
      });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, t("genericError")));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <div className="mt-4 grid gap-4">
        <div>
          <Label htmlFor="staff-invite-email" className="text-[12px] text-ink-muted">
            {t("emailLabel")}
          </Label>
          <Input
            id="staff-invite-email"
            type="email"
            autoComplete="off"
            className="mt-1.5"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("emailPlaceholder")}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[12px] text-ink-muted">{t("roleLabel")}</p>
          <RoleChoiceList
            roles={roles}
            value={roleId}
            onChange={setRoleId}
            isGrantable={(role) => canGrantRole(access, role)}
          />
        </div>
        <div>
          <Label htmlFor="staff-invite-note" className="text-[12px] text-ink-muted">
            {t("noteLabel")}
          </Label>
          <Textarea
            id="staff-invite-note"
            className="mt-1.5"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("notePlaceholder")}
          />
        </div>
        {error ? <InlineError message={error} /> : null}
      </div>
      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onDone} disabled={invite.isPending}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={invite.isPending}>
          {invite.isPending ? t("sending") : t("send")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Move someone to another role. A reason is required: it is the audit log's only "why". */
export function ChangeStaffRoleDialog({
  member,
  onOpenChange,
  roles,
}: {
  member: StaffMemberDto | null;
  onOpenChange: (open: boolean) => void;
  roles: readonly StaffRoleDto[];
}) {
  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-lg">
        {member ? <ChangeRoleForm key={member.userId} member={member} roles={roles} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleForm({
  member,
  roles,
  onDone,
}: {
  member: StaffMemberDto;
  roles: readonly StaffRoleDto[];
  onDone: () => void;
}) {
  const t = useTranslations("adminStaff.changeRole");
  const tReason = useTranslations("adminStaff.reasonDialog");
  const { access } = useStaffAccess();
  const change = useChangeStaffRole();
  const [roleId, setRoleId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!roleId) {
      setError(t("chooseRole"));
      return;
    }
    if (reason.trim().length < MIN_REASON_LENGTH) {
      setError(tReason("reasonTooShort", { count: MIN_REASON_LENGTH }));
      return;
    }
    try {
      setError(null);
      await change.mutateAsync({ userId: member.userId, roleId, reason: reason.trim() });
      toast.success(t("doneToast", { name: member.fullName }));
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, tReason("genericError")));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title", { name: member.fullName })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <div className="mt-4 grid gap-4">
        <RoleChoiceList
          roles={roles}
          value={roleId}
          onChange={setRoleId}
          currentRoleId={member.roleId}
          isGrantable={(role) => canGrantRole(access, role)}
        />
        <div>
          <Label htmlFor="staff-role-reason" className="text-[12px] text-ink-muted">
            {tReason("reasonLabel")}
          </Label>
          <Textarea
            id="staff-role-reason"
            className="mt-1.5"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={tReason("reasonPlaceholder")}
          />
        </div>
        {error ? <InlineError message={error} /> : null}
      </div>
      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onDone} disabled={change.isPending}>
          {tReason("back")}
        </Button>
        <Button onClick={() => void submit()} disabled={change.isPending}>
          {change.isPending ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
