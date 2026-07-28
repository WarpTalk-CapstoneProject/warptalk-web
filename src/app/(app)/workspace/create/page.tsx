"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  CheckCircle,
  GlobeHemisphereWest,
  LinkSimple,
  LockKey,
  Spinner,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  extractEmailDomain,
  getDomainFromEmail,
  isPublicEmailDomain,
  slugPreviewFromName,
} from "@/features/workspace/lib/email-domain";
import { useCreateWorkspace, useSelectWorkspace } from "@/hooks/use-workspace";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { WorkspaceDto } from "@/types/workspace";

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Workspace name must be at least 2 characters").max(100, "Workspace name must be 100 characters or fewer"),
  logoUrl: z.string().trim().url("Logo URL must be a valid URL").optional().or(z.literal("")),
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

const salesIntentStorageKey = "warptalk:sales-package-intent";

interface SalesPackageIntent {
  workEmail?: string;
  company?: string;
  requestType?: string;
  featureInterests?: string[];
  targetLanguages?: string[];
  currentMonthlyMeetingVolume?: string;
  expectedMonthlyMeetingVolumeInSixMonths?: string | null;
  useCaseNotes?: string | null;
  pricingEstimate?: {
    estimatedCredits?: number | null;
    creditsPerCycle?: number | null;
    planPrice?: number | null;
  } | null;
}

function readSalesPackageIntent(): SalesPackageIntent | null {
  try {
    const rawIntent = window.sessionStorage.getItem(salesIntentStorageKey);
    if (!rawIntent) return null;
    return JSON.parse(rawIntent) as SalesPackageIntent;
  } catch {
    window.sessionStorage.removeItem(salesIntentStorageKey);
    return null;
  }
}

export default function CreateWorkspaceDemoPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const createWorkspace = useCreateWorkspace();
  const selectWorkspace = useSelectWorkspace();
  const [serverError, setServerError] = useState<ServerErrorState | null>(null);
  const [createdWorkspace, setCreatedWorkspace] = useState<WorkspaceDto | null>(null);
  const [mounted, setMounted] = useState(false);
  const [salesIntent, setSalesIntent] = useState<SalesPackageIntent | null>(null);

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
  const watchedLogoUrl = useWatch({ control: form.control, name: "logoUrl" }) ?? "";
  const slugPreview = useMemo(() => slugPreviewFromName(watchedName), [watchedName]);
  const isBusy = createWorkspace.isPending || selectWorkspace.isPending || form.formState.isSubmitting;
  const canCreate = isAuthenticated && !!emailDomain && !accountIssue && !activeWorkspaceId;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const intent = readSalesPackageIntent();
    setSalesIntent(intent);
    if (intent?.company && !form.getValues("name")) {
      form.setValue("name", intent.company, { shouldDirty: true, shouldValidate: true });
    }
  }, [mounted, form]);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.replace("/login");
  }, [mounted, isAuthenticated, router]);

  useEffect(() => {
    if (mounted && activeWorkspaceId) {
      router.replace(`/${activeWorkspaceSlug || "workspace"}/home`);
    }
  }, [mounted, activeWorkspaceId, activeWorkspaceSlug, router]);

  async function onSubmit(values: CreateWorkspaceFormData) {
    if (!emailDomain) {
      setServerError({
        kind: "account",
        message: accountIssue ?? "A valid business email is required before creating a workspace.",
      });
      return;
    }

    setServerError(null);

    try {
      const workspace = await createWorkspace.mutateAsync({
        name: values.name.trim(),
        logoUrl: values.logoUrl?.trim() || null,
        verifiedDomains: [emailDomain],
        requireVerifiedDomainForInternal: true,
      });

      setCreatedWorkspace(workspace);
      await provisionTrialSubscription(workspace.id);
      await selectWorkspace.mutateAsync(workspace.id);
      setActiveWorkspace(workspace.id, workspace.name, workspace.slug, workspace.role || "Owner", "Internal", "en");
      toast.success(`Workspace "${workspace.name}" created with an Enterprise free trial.`);
      router.push(`/${workspace.slug}/home`);
    } catch (error) {
      const nextError = classifyCreateError(error);
      setServerError(nextError);
      toast.error(nextError.message);
    }
  }

  async function provisionTrialSubscription(workspaceId: string) {
    if (!user?.id || !user.email) return;

    const billingContactEmail = salesIntent?.workEmail?.trim().toLowerCase() || user.email;

    try {
      await billingService.createTrialSubscription({
        workspaceId,
        userId: user.id,
        ownerEmail: billingContactEmail,
      });
    } catch {
      toast.info("Workspace created. Enterprise trial setup can be completed by WarpTalk billing.");
    } finally {
      window.sessionStorage.removeItem(salesIntentStorageKey);
    }
  }

  if (!mounted || !isAuthenticated || activeWorkspaceId) {
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {/* Server/Account Errors */}
          {(accountIssue || serverError) && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-[12px] text-destructive leading-relaxed">
              {serverError?.message ?? accountIssue}
            </div>
          )}

          {/* Name Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-name" className="text-[12px] font-medium text-ink-muted">
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
              <p className="text-[11px] text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* URL Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-url" className="text-[12px] font-medium text-ink-muted">
              URL
            </label>
            <div className="flex items-center rounded-md border border-border bg-surface-2/40 px-3 h-10 text-[14px] text-ink select-none font-mono">
              <span className="text-ink-muted">warptalk.app/</span>
              <span className="text-foreground truncate font-medium ml-0.5">
                {slugPreview || "workspace-name"}
              </span>
            </div>
            {emailDomain && (
              <p className="text-[11px] text-ink-muted mt-1">
                Workspace will be verified for <span className="font-semibold text-foreground">{emailDomain}</span>
              </p>
            )}
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

function DtoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 px-3 py-2">
      <span className="font-mono text-ink-muted">{label}</span>
      <span className="truncate font-mono text-foreground">{value}</span>
    </div>
  );
}

function getAccountIssue(email: string | undefined, rawDomain: string | null, isPublicDomain: boolean): string | null {
  if (!email) return "Signed-in account email is missing.";
  if (!rawDomain) return "Signed-in account email is invalid.";
  if (isPublicDomain) return "Use a business email or join by invitation. Public email domains cannot be system-verified for an Enterprise Workspace.";
  return null;
}

function classifyCreateError(error: unknown): ServerErrorState {
  const message = getApiErrorMessage(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("domain") || normalized.includes("verified")) {
    return { kind: "domain", message };
  }

  if (normalized.includes("already internal") || normalized.includes("internal home") || normalized.includes("useralreadyinternal")) {
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
