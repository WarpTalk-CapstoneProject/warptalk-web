"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Globe, Plus, Spinner, Trash } from "@phosphor-icons/react";

import { Input } from "@/components/ui/input";
import {
  useAddVerifiedDomain,
  useRevokeVerifiedDomain,
  useVerifiedDomains,
} from "@/hooks/use-workspace";
import { extractEmailDomain, isPublicEmailDomain } from "@/lib/workspace/email-domain";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Which consent text the owner agreed to when claiming a domain that is not their own account's.
 * Recorded on the domain row, so a later change to the wording stays distinguishable from what
 * was actually agreed to. Bump this whenever the text below changes, or the record stops meaning
 * anything.
 */
const SELF_ASSERTED_DOMAIN_CONSENT_VERSION = "2026-08-13";

const selfAssertedConsentText = (domain: string) =>
  `WarpTalk does not verify domain ownership. Adding ${domain} records your organization's assertion that it owns this domain.\n\n` +
  `Confirm that your organization owns ${domain}, and that you understand anyone invited with an @${domain} address can be assigned Internal membership.`;

const lastDomainRevokeText = (domain: string) =>
  `${domain} is the last verified domain for this workspace.\n\n` +
  `Revoking it stops membership being decided by email domain: from then on you assign Internal and External by hand when inviting. ` +
  `Members who are already Internal keep their access.`;

/**
 * Managing the domains that decide who counts as an internal member.
 *
 * Owner-only, and it lives on the Advanced page rather than in Settings. Adding a domain hands
 * whoever holds this workspace the power to classify every future joiner on that domain as
 * Internal — that is not a preference sitting between "default language" and "profanity filter",
 * and it should not be one click away from them.
 *
 * Settings keeps a read-only summary of the resulting policy, which is what an Admin needs to
 * understand the workspace without being able to change it.
 */
export function VerifiedDomainsManager({ workspaceId }: { workspaceId: string }) {
  const currentUserEmail = useAuthStore((state) => state.user?.email);
  const ownEmailDomain = extractEmailDomain(currentUserEmail);

  const domainsQuery = useVerifiedDomains(workspaceId);
  const addDomain = useAddVerifiedDomain(workspaceId);
  const revokeDomain = useRevokeVerifiedDomain(workspaceId);

  const [newDomain, setNewDomain] = useState("");

  const domains = domainsQuery.data || [];

  const handleAdd = async () => {
    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed) return;

    if (!trimmed.includes(".") || trimmed.startsWith(".") || trimmed.endsWith(".")) {
      toast.error("Invalid domain format.");
      return;
    }
    // The shared list, not a local copy. This check once named four providers inline while
    // PUBLIC_EMAIL_DOMAINS listed thirteen, so proton.me passed here and came back a 403.
    if (isPublicEmailDomain(trimmed)) {
      toast.error("Public email domains cannot be verified as company domains.");
      return;
    }
    if (domains.some((d) => d.domain.toLowerCase() === trimmed)) {
      toast.error("Domain already added.");
      return;
    }

    // Nothing can verify a domain that is not the owner's own, so the server requires them to
    // say they own it, and records which version of that text they agreed to.
    const consentVersion =
      ownEmailDomain && trimmed === ownEmailDomain ? undefined : SELF_ASSERTED_DOMAIN_CONSENT_VERSION;
    if (consentVersion && !window.confirm(selfAssertedConsentText(trimmed))) return;

    try {
      await addDomain.mutateAsync({ domain: trimmed, consentVersion });
      toast.success(`${trimmed} is now a verified domain.`);
      setNewDomain("");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          || "Failed to add verified domain.",
      );
    }
  };

  const handleRevoke = async (domainId: string, domain: string) => {
    // Revoking the last one is how a workspace stops deciding membership by domain, so it is a
    // policy change and not just a list edit. Say so before it happens rather than after.
    if (domains.length === 1 && !window.confirm(lastDomainRevokeText(domain))) return;

    try {
      await revokeDomain.mutateAsync(domainId);
      toast.success(`${domain} is no longer a verified domain.`);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          || "Failed to revoke verified domain.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-hairline bg-surface-2/40 p-3 text-xs text-ink-muted">
        WarpTalk does not check DNS. Each domain listed here is your organization&apos;s assertion
        that it owns that domain — anyone invited on it can be made an internal member.
      </div>

      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Enter a domain (e.g., company.com)"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          disabled={addDomain.isPending}
          className="h-9 flex-1 border-hairline bg-surface-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={addDomain.isPending || !newDomain.trim()}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-3 px-4 text-sm font-semibold text-ink transition hover:bg-surface-4 disabled:opacity-50"
        >
          {addDomain.isPending ? <Spinner className="h-4 w-4 animate-spin" /> : <Plus size={14} />}
          Add domain
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {domainsQuery.isPending ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Spinner className="h-3.5 w-3.5 animate-spin" /> Loading domains…
          </span>
        ) : domains.length === 0 ? (
          <span className="text-xs italic text-ink-muted">
            No verified domains. Until one is added, you assign internal and external membership by
            hand when inviting.
          </span>
        ) : (
          domains.map((vd) => (
            <div
              key={vd.id}
              className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-1 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Globe size={14} className="shrink-0 text-primary" />
                <span className="truncate font-mono text-xs text-ink">{vd.domain}</span>
                {/*
                  What backs this claim. A domain matching the owner's own address is evidenced by
                  that account; anything else rests only on their assertion, and saying which is
                  which is the whole point of recording the tier.
                */}
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    vd.verificationMethod === "self_asserted"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-surface-3 text-ink-muted"
                  }`}
                  title={
                    vd.verificationMethod === "self_asserted"
                      ? "Asserted by the workspace owner. Not verified against DNS."
                      : "Matches the workspace owner's own email domain."
                  }
                >
                  {vd.verificationMethod === "self_asserted" ? "Self-asserted" : "Owner email"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(vd.id, vd.domain)}
                disabled={revokeDomain.isPending}
                className="shrink-0 cursor-pointer text-ink-muted transition-colors hover:text-destructive disabled:opacity-50"
                title={`Revoke ${vd.domain}`}
              >
                <Trash size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
