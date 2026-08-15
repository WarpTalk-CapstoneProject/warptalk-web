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
import { buildCreateWorkspacePayload } from "@/lib/workspace/create-workspace-payload";
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
  const accountIssue = getAccountIssue(user?.email, rawDomain, isPublicDomain);

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
  // rawDomain, not emailDomain: getDomainFromEmail deliberately returns null for a public
  // domain, so gating on it would keep refusing gmail.com after WT-417 removed the rule.
  const canCreate = isAuthenticated && !!rawDomain && !accountIssue;

  useEffect(() => {
    if (mounted && !isAuthenticated) router.replace("/login");
  }, [mounted, isAuthenticated, router]);

  async function onSubmit(values: CreateWorkspaceFormData) {
    // WT-418, and the second half of it. The rule that a public-domain account may not found a
    // workspace was relaxed in three places and missed in two — both here.
    //
    // This guard read `emailDomain`, which is getDomainFromEmail and returns null for a public
    // domain BY DESIGN. So every Gmail user was turned away with "A valid business email is
    // required" before a request was ever sent — behind a button that had already been fixed to
    // enable. It enabled, and then the form refused.
    //
    // And the payload below asked to verify the account's own domain unconditionally, which for
    // gmail.com is the one thing the server must refuse. Two dead ends in a row.
    //
    // Both decisions now live in lib/workspace/create-workspace-payload.ts, so the next person
    // changing this rule changes one thing.
    const payload = buildCreateWorkspacePayload(user?.email, {
      name: values.name,
      logoUrl: values.logoUrl,
    });

    if (!payload) {
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
      const workspace = await createWorkspace.mutateAsync(payload);

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
            {/* Say which of the two workspaces this will be, rather than saying nothing for one
                of them. A personal-domain workspace is not a degraded corporate one — it simply
                has no domain to claim, and claiming is a separate permission from founding. */}
            {emailDomain ? (
              <p className="text-[11px] text-ink-muted mt-1">
                Workspace will be verified for{" "}
                <span className="font-semibold text-foreground">
                  {emailDomain}
                </span>
              </p>
            ) : isPublicDomain ? (
              <p className="text-[11px] text-ink-muted mt-1">
                Teammates join by invitation — a personal email domain cannot be verified.
              </p>
            ) : null}
          </div>

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

function getAccountIssue(
  email: string | undefined,
  rawDomain: string | null,
  isPublicDomain: boolean,
): string | null {
  if (!email) return "Signed-in account email is missing.";
  if (!rawDomain) return "Signed-in account email is invalid.";
  // WT-417: a public domain no longer blocks creation. It still cannot be system-VERIFIED —
  // verifying gmail.com would make every Gmail address Internal to the workspace — and the
  // server refuses that separately, so the only thing this screen needs to stop is a missing
  // or malformed account email.
  void isPublicDomain;
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
