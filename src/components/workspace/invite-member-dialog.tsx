"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInviteWorkspaceMember } from "@/hooks/use-workspace";

/**
 * The one dialog for inviting somebody into a workspace.
 *
 * There were two, and they behaved differently in ways that mattered. The sidebar's version
 * showed the invitation link — the plaintext token exists for exactly one response and is
 * never retrievable again — while the Members version showed a `/dev/email/...` preview URL
 * that does not exist in production. Only one of those is usable when email delivery fails,
 * which is the case the link was added for.
 *
 * They also disagreed on who may be invited as an Admin. The server settles it:
 * `AdminCannotPromoteToAdmin` — an Admin inviting an Admin is refused, so offering the
 * option to an Admin only produces a 403 after they have typed an address.
 */
export function InviteMemberDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  canGrantAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName?: string | null;
  /** Owners only. An Admin who picks Admin is refused by the server. */
  canGrantAdmin: boolean;
}) {
  const [email, setEmail] = useState("");
  const [roleName, setRoleName] = useState("Member");
  // Set once the server returns the token. The row keeps only a hash, so this is the single
  // moment the link exists — the dialog stays on it until the inviter dismisses it.
  const [link, setLink] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [delivered, setDelivered] = useState(true);

  const inviteMutation = useInviteWorkspaceMember(workspaceId);

  const reset = () => {
    setEmail("");
    setRoleName("Member");
    setLink(null);
    setLinkEmail("");
    setDelivered(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!workspaceId || !trimmed) return;

    try {
      const response = await inviteMutation.mutateAsync({
        email: trimmed,
        roleName,
      });

      // Delivery can fail while the invitation itself is perfectly valid — the server says
      // so in `warning`. Reporting "Invitation sent" in that case is a lie the recipient
      // pays for, so the two outcomes are told apart.
      const wasDelivered = !response?.warning;
      const token = response?.rawToken;

      if (token) {
        setLink(`${window.location.origin}/invitations/${token}`);
        setLinkEmail(trimmed);
        setDelivered(wasDelivered);
      } else {
        // Server without the token change: behave exactly as before.
        toast[wasDelivered ? "success" : "warning"](
          wasDelivered
            ? `Invitation sent to ${trimmed}`
            : `Invitation created for ${trimmed}, but the email could not be delivered.`,
        );
        reset();
        onOpenChange(false);
      }
    } catch (err) {
      const error = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to send invitation",
      );
    }
  };

  return (
    /*
      Reset on close, not just on the Done button. Dismissing with Escape or the X would
      otherwise leave the previous invitee's link in state, and the next person to open
      this dialog would be shown a link addressed to someone else.
    */
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-[520px]">
        <div className="h-36 border-b border-border bg-[radial-gradient(circle_at_28%_18%,rgba(94,106,210,0.30),transparent_34%),radial-gradient(circle_at_78%_22%,rgba(16,185,129,0.18),transparent_30%),linear-gradient(135deg,var(--surface-2),var(--surface-1))]">
          <div className="flex h-full items-end p-5">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                <PaperPlaneTilt size={12} weight="bold" />
                Workspace Invite
              </span>
              <DialogTitle className="mt-2 text-lg font-semibold text-foreground">
                Invite your team to {workspaceName || "this workspace"}
              </DialogTitle>
            </div>
          </div>
        </div>

        {link ? (
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                Invitation created for {linkEmail}
              </p>
              <p className="text-xs text-ink-muted">
                {delivered
                  ? "We emailed them a link. You can also share it directly."
                  : "The email could not be delivered — share this link instead."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-link" className="text-xs font-medium">
                Invitation link
              </Label>
              <div className="flex gap-2">
                <Input
                  id="invite-link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="bg-surface-1 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      toast.success("Invitation link copied");
                    } catch {
                      // Clipboard access is refused outside a secure context and in some
                      // embedded browsers. The field is selectable, so say that rather
                      // than leaving a button that silently does nothing.
                      toast.error(
                        "Could not copy — select the link and copy it manually",
                      );
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-ink-muted">
                Single use, and only {linkEmail} can accept it. This link is
                shown once — it cannot be retrieved again after you close this
                dialog.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={reset}>
                Invite someone else
              </Button>
              <Button
                type="button"
                className="text-white"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-xs font-medium">
                Email address
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-surface-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role" className="text-xs font-medium">
                Role
              </Label>
              <select
                id="invite-role"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-surface-1 px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="Member">Member</option>
                {canGrantAdmin && <option value="Admin">Admin</option>}
              </select>
              <p className="text-[11px] leading-4 text-ink-muted">
                Internal or External access is assigned automatically from the
                workspace&apos;s verified domains.
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviteMutation.isPending || !email.trim()}
                className="text-white"
              >
                {inviteMutation.isPending ? "Sending..." : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
