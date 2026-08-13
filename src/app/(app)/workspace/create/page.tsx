"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Spinner } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  extractEmailDomain,
  getDomainFromEmail,
  isPublicEmailDomain,
  slugPreviewFromName,
} from "@/lib/workspace/email-domain";
import { useCreateWorkspace, useSelectWorkspace } from "@/hooks/use-workspace";
import { applySelectedWorkspace } from "@/lib/workspace/apply-selected-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Workspace name must be at least 2 characters")
    .max(100, "Workspace name must be 100 characters or fewer"),
  logoUrl: z
    .string()
    .trim()
    .url("Logo URL must be a valid URL")
    .optional()
    .or(z.literal("")),
});

type CreateWorkspaceFormData = z.infer<typeof createWorkspaceSchema>;

/**
 * How this workspace decides who counts as an Internal member.
 *
 * Both are Enterprise Workspaces — there is no lesser kind. The difference is only how
 * far the Owner's Internal/External choices are constrained:
 *
 * - `domain-verified`: choosing Internal requires the invitee's email to be on a verified
 *   company domain.
 * - `manual`: the Owner draws that line by hand. Internal and External still mean exactly
 *   what they mean elsewhere; they just are not decided by the email domain.
 */
type MembershipPolicy = "domain-verified" | "manual";

type ServerErrorKind = "account" | "domain" | "internal-home" | "form";

interface ServerErrorState {
  kind: ServerErrorKind;
  message: string;
}

interface ApiErrorShape {
  response?: {
    data?: {
      error?: string;
      message?: string;
      title?: string;
      detail?: string;
    };
  };
  message?: string;
}

export default function CreateWorkspaceDemoPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setActiveWorkspace = useWorkspaceStore(
    (state) => state.setActiveWorkspace,
  );
  const createWorkspace = useCreateWorkspace();
  const selectWorkspace = useSelectWorkspace();
  const [serverError, setServerError] = useState<ServerErrorState | null>(null);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const rawDomain = extractEmailDomain(user?.email);
  const emailDomain = getDomainFromEmail(user?.email);
  const isPublicDomain = isPublicEmailDomain(rawDomain);

  // Which membership policy the new workspace gets. Both are Enterprise Workspaces;
  // what differs is whether the Owner's Internal/External choices are constrained by a
  // verified domain. A public mailbox can never be verified, so those accounts can only
  // pick the manual policy — the server enforces the same rule.
  const [membershipPolicy, setMembershipPolicy] =
    useState<MembershipPolicy>(isPublicDomain ? "manual" : "domain-verified");
  const wantsVerifiedDomain = membershipPolicy === "domain-verified";
  const accountIssue = getAccountIssue(
    user?.email,
    rawDomain,
    isPublicDomain,
    wantsVerifiedDomain,
  );

  const form = useForm<CreateWorkspaceFormData>({
    resolver: zodResolver(createWorkspaceSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      logoUrl: "",
    },
  });

  const watchedName = useWatch({ control: form.control, name: "name" }) ?? "";
  const slugPreview = useMemo(
    () => slugPreviewFromName(watchedName),
    [watchedName],
  );
  const isBusy =
    createWorkspace.isPending ||
    selectWorkspace.isPending ||
    form.formState.isSubmitting;
  const canCreate = isAuthenticated && !!rawDomain && !accountIssue;

  useEffect(() => {
    if (mounted && !isAuthenticated) router.replace("/login");
  }, [mounted, isAuthenticated, router]);

  async function onSubmit(values: CreateWorkspaceFormData) {
    if (!rawDomain || (wantsVerifiedDomain && !emailDomain)) {
      setServerError({
        kind: "account",
        message:
          accountIssue ??
          "A valid email address is required before creating a workspace.",
      });
      return;
    }

    setServerError(null);

    try {
      const workspace = await createWorkspace.mutateAsync({
        name: values.name.trim(),
        logoUrl: values.logoUrl?.trim() || null,
        // Only send a domain when one is actually being claimed. Sending an empty list
        // alongside the flag would say two things at once; the server decides the policy
        // from the domains it ends up holding, so say exactly one of them.
        ...(wantsVerifiedDomain && emailDomain
          ? { verifiedDomains: [emailDomain] }
          : {}),
        requireVerifiedDomainForInternal: wantsVerifiedDomain,
      });

      const selection = await selectWorkspace.mutateAsync(workspace.id);
      applySelectedWorkspace(selection, setActiveWorkspace);
      toast.success(`Workspace "${workspace.name}" created.`);
      router.push(`/${selection.slug}/home`);
    } catch (error) {
      const nextError = classifyCreateError(error);
      setServerError(nextError);
      toast.error(nextError.message);
    }
  }

  if (!mounted || !isAuthenticated) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-start bg-canvas px-4 pt-[12vh] pb-12 text-ink font-sans select-none antialiased">
      <div className="w-full max-w-[420px] flex flex-col gap-8">
        {/* Back and Identity Header */}
        <div className="flex items-center justify-between text-[12px] text-ink-muted font-medium">
          <button
            type="button"
            onClick={() => router.push("/workspace")}
            className="flex items-center gap-1.5 hover:text-ink transition-colors cursor-pointer"
          >
            <ArrowLeft size={13} />
            Back
          </button>
          <span className="truncate">{user?.email}</span>
        </div>

        {/* Title / Subtitle */}
        <div className="text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground text-balance">
            Create a workspace
          </h1>
          <p className="mt-2 text-[14px] text-ink-muted text-pretty">
            Move work forward across teams and agents
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-5"
        >
          {/* Server/Account Errors */}
          {(accountIssue || serverError) && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-[12px] text-destructive leading-relaxed">
              {serverError?.message ?? accountIssue}
            </div>
          )}

          {/* Name Field */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="workspace-name"
              className="text-[12px] font-medium text-ink-muted"
            >
              Name
            </label>
            <Input
              id="workspace-name"
              placeholder="e.g. Acme Corp"
              disabled={isBusy}
              className="bg-surface-1 border-border rounded-md h-10 px-3 text-[14px] focus-visible:ring-1 focus-visible:ring-primary outline-none"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-[11px] text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* URL Field */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="workspace-url"
              className="text-[12px] font-medium text-ink-muted"
            >
              URL
            </label>
            <div className="flex items-center rounded-md border border-border bg-surface-2/40 px-3 h-10 text-[14px] text-ink select-none font-mono">
              <span className="text-ink-muted">warptalk.app/</span>
              <span className="text-foreground truncate font-medium ml-0.5">
                {slugPreview || "workspace-name"}
              </span>
            </div>
          </div>

          {/* Membership policy */}
          <fieldset className="flex flex-col gap-1.5" disabled={isBusy}>
            <legend className="text-[12px] font-medium text-ink-muted mb-1.5">
              Who counts as an internal member
            </legend>

            <div className="flex flex-col gap-2">
              <PolicyOption
                value="domain-verified"
                selected={membershipPolicy}
                onSelect={setMembershipPolicy}
                disabled={isPublicDomain}
                title="Verify a company domain"
                description={
                  emailDomain
                    ? `Anyone invited with an @${emailDomain} address can be an internal member. Other addresses can only join as external.`
                    : "Anyone invited on your company's domain can be an internal member. Other addresses can only join as external."
                }
                footer={
                  isPublicDomain ? (
                    <span className="text-ink-subtle">
                      Not available for {rawDomain} — public email domains cannot
                      be verified.
                    </span>
                  ) : emailDomain ? (
                    <span className="inline-flex items-center gap-1.5 rounded border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-ink">
                      {emailDomain}
                    </span>
                  ) : null
                }
              />

              <PolicyOption
                value="manual"
                selected={membershipPolicy}
                onSelect={setMembershipPolicy}
                title="Assign members manually"
                description="You decide who is internal and who is external when you invite them. No domain is verified."
                footer={
                  <span className="text-ink-subtle">
                    You can verify a domain later in Advanced settings.
                  </span>
                }
              />
            </div>
          </fieldset>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={!canCreate || isBusy}
            className="w-full rounded-md h-10 bg-primary text-white hover:bg-primary-hover font-medium text-[14px] transition-colors mt-2"
          >
            {isBusy ? (
              <Spinner className="animate-spin size-4 text-white" />
            ) : (
              "Create workspace"
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}

function PolicyOption({
  value,
  selected,
  onSelect,
  title,
  description,
  footer,
  disabled = false,
}: {
  value: MembershipPolicy;
  selected: MembershipPolicy;
  onSelect: (value: MembershipPolicy) => void;
  title: string;
  description: string;
  footer?: React.ReactNode;
  disabled?: boolean;
}) {
  const isSelected = selected === value;
  return (
    <label
      className={`flex gap-2.5 rounded-md border p-3 transition-colors ${
        disabled
          ? "cursor-not-allowed border-border bg-surface-2/30 opacity-60"
          : isSelected
            ? "cursor-pointer border-primary bg-primary/5"
            : "cursor-pointer border-border hover:bg-surface-2/40"
      }`}
    >
      <input
        type="radio"
        name="membership-policy"
        value={value}
        checked={isSelected}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-0.5 accent-primary"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-foreground">{title}</span>
        <span className="text-[11px] leading-4 text-ink-muted">
          {description}
        </span>
        {footer && <span className="mt-1 text-[10px] leading-4">{footer}</span>}
      </span>
    </label>
  );
}

function getAccountIssue(
  email: string | undefined,
  rawDomain: string | null,
  isPublicDomain: boolean,
  wantsVerifiedDomain: boolean,
): string | null {
  if (!email) return "Signed-in account email is missing.";
  if (!rawDomain) return "Signed-in account email is invalid.";
  // Only a blocker for the domain-verified policy: a public mailbox cannot be verified as
  // a company domain, so there is nothing to claim. It is no obstacle to a workspace that
  // claims no domain at all, and the server draws the line in the same place.
  if (isPublicDomain && wantsVerifiedDomain)
    return `${rawDomain} is a public email domain and cannot be verified as a company domain. Choose "Assign members manually" instead, or sign in with a work address.`;
  return null;
}

function classifyCreateError(error: unknown): ServerErrorState {
  const message = getApiErrorMessage(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("domain") || normalized.includes("verified")) {
    return { kind: "domain", message };
  }

  if (
    normalized.includes("already internal") ||
    normalized.includes("internal home") ||
    normalized.includes("useralreadyinternal")
  ) {
    return { kind: "internal-home", message };
  }

  if (normalized.includes("email") || normalized.includes("account")) {
    return { kind: "account", message };
  }

  return { kind: "form", message };
}

function getApiErrorMessage(error: unknown): string {
  const candidate = error as ApiErrorShape;
  return (
    candidate.response?.data?.error ??
    candidate.response?.data?.message ??
    candidate.response?.data?.detail ??
    candidate.response?.data?.title ??
    candidate.message ??
    "Failed to create workspace. Please try again."
  );
}
