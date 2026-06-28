"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Trash,
  Spinner,
  Lock,
  Globe,
  Copy,
  Robot,
  EyeSlash,
  ShieldCheck,
  Translate,
  GlobeHemisphereWest
} from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  useWorkspaceSettings,
  useUpdateWorkspaceSettings,
} from "@/hooks/use-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const securitySchema = z.object({
  allowExternalCollaboration: z.boolean(),
  requireVerifiedDomainForInternal: z.boolean(),
  aiUsagePolicy: z.any().optional(),
});

type SecurityFormData = z.infer<typeof securitySchema>;

export default function SecurityPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);

  const [newDomain, setNewDomain] = useState("");
  const [domainError, setDomainError] = useState("");

  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");
  const updateSettingsMutation = useUpdateWorkspaceSettings(activeWorkspaceId || "");

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<SecurityFormData>({
    resolver: zodResolver(securitySchema),
  });

  const watchAll = watch();

  useEffect(() => {
    if (settingsQuery.data) {
      reset({
        allowExternalCollaboration: settingsQuery.data.allowExternalCollaboration,
        requireVerifiedDomainForInternal: settingsQuery.data.requireVerifiedDomainForInternal,
        aiUsagePolicy: settingsQuery.data.aiUsagePolicy || {
          allowExternalLlm: true,
          redactPii: { enabled: false },
          dlp: { enabled: false, keywordsBlacklist: [] },
          translationProfile: {
            translationTone: "default",
            languageSpecificRules: {
              vietnameseHonorificStyle: "default",
              japaneseHonorificStyle: "default",
            }
          }
        },
      });
    }
  }, [settingsQuery.data, reset]);

  if (!activeWorkspaceId) return null;

  const isOwner = role === "Owner";
  const isAdmin = role === "Admin";
  const isOwnerOrAdmin = isOwner || isAdmin;

  if (!isOwnerOrAdmin) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Access Denied</CardTitle>
            <CardDescription className="text-xs">
              Only workspace Owners and Administrators can modify security configurations.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSettingsSubmit = async (formData: SecurityFormData) => {
    if (!settingsQuery.data) return;
    try {
      await updateSettingsMutation.mutateAsync({
        ...settingsQuery.data,
        ...formData,
      });
      toast.success("Security settings updated successfully.");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
        || "Failed to update settings.";
      toast.error(errorMsg);
    }
  };

  const handleAddDomain = async () => {
    if (!settingsQuery.data) return;
    setDomainError("");

    const domain = newDomain.trim().toLowerCase();
    const isDomain = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(domain);
    
    if (!isDomain) {
      setDomainError("Please enter a valid domain (e.g. acme.com).");
      return;
    }

    const publicDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com"];
    if (publicDomains.includes(domain)) {
      setDomainError("Public email providers are not allowed for enterprise domain verification.");
      return;
    }

    if (settingsQuery.data.verifiedDomains.includes(domain)) {
      setDomainError("This domain is already registered.");
      return;
    }

    try {
      const updatedDomains = [...settingsQuery.data.verifiedDomains, domain];
      await updateSettingsMutation.mutateAsync({
        ...settingsQuery.data,
        verifiedDomains: updatedDomains,
      });
      setNewDomain("");
      toast.success(`Domain "${domain}" added to register.`);
    } catch {
      toast.error("Failed to add domain.");
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    if (!settingsQuery.data) return;
    try {
      const updatedDomains = settingsQuery.data.verifiedDomains.filter((d) => d !== domain);
      await updateSettingsMutation.mutateAsync({
        ...settingsQuery.data,
        verifiedDomains: updatedDomains,
      });
      toast.success(`Domain "${domain}" removed.`);
    } catch {
      toast.error("Failed to remove domain.");
    }
  };

  const copyTxtValue = (domain: string) => {
    const txtVal = `warptalk-domain-verification=${domain.split(".")[0]}-txt-token-99823`;
    navigator.clipboard.writeText(txtVal);
    toast.success("Verification TXT token copied!");
  };

  return (
    <div className="flex min-h-full flex-col gap-6 px-4 py-4 pb-6 text-ink">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left Side: Security & AI Policy Forms */}
        <div className="flex flex-col gap-6">
          <form onSubmit={handleSubmit(handleSettingsSubmit)} className="flex flex-col gap-6">
            
            {/* Collaboration policy settings card */}
            <Card className="border-hairline bg-surface-1 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Collaboration & Security</CardTitle>
                <CardDescription className="text-xs">
                  Restrict access based on domain configuration.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* Allow External Collaboration */}
                <div className="flex items-center justify-between rounded-md border border-hairline bg-surface-2 p-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold">Allow External Collaboration</span>
                      {!isOwner && (
                        <Badge className="bg-amber-500/5 text-amber-500 border border-amber-500/20 text-[9px] py-0 px-1 rounded-sm">
                          Owner Only
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-ink-muted">
                      Allows inviting external members (partners/clients)
                    </span>
                  </div>
                  <Switch
                    checked={watchAll.allowExternalCollaboration}
                    onCheckedChange={(val) => setValue("allowExternalCollaboration", val, { shouldDirty: true })}
                    disabled={isSubmitting || !isOwner}
                  />
                </div>

                {/* Require verified domains for internal */}
                <div className="flex items-center justify-between rounded-md border border-hairline bg-surface-2 p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold">Restrict Internal Accounts to Verified Domains</span>
                    <span className="text-[10px] text-ink-muted">
                      Internal members must match registered business domains
                    </span>
                  </div>
                  <Switch
                    checked={watchAll.requireVerifiedDomainForInternal}
                    onCheckedChange={(val) => setValue("requireVerifiedDomainForInternal", val, { shouldDirty: true })}
                    disabled={isSubmitting}
                  />
                </div>
              </CardContent>
            </Card>

            {/* AI Policy & Security */}
            <Card className="border-hairline bg-surface-1 shadow-sm border-l-4 border-l-indigo-500">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-500">
                    <Robot weight="duotone" className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">AI Policy & Compliance</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Configure guardrails for AI translation, privacy, and tone.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {/* Section 1: Privacy & LLM */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-[11px] font-bold text-ink-subtle uppercase tracking-wider">Privacy & Core Models</h4>
                  <div className="rounded-lg border border-hairline overflow-hidden divide-y divide-hairline">
                    <div className="flex items-center justify-between bg-surface-1 hover:bg-surface-2/40 transition-colors p-4">
                      <div className="flex items-start gap-3">
                        <GlobeHemisphereWest weight="duotone" className="w-4 h-4 text-ink-muted mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-ink">Enable External LLMs</span>
                          <span className="text-[11px] text-ink-muted leading-relaxed">
                            Allow sensitive data to be sent to high-performance external models (e.g. OpenAI).
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={watchAll.aiUsagePolicy?.allowExternalLlm ?? true}
                        onCheckedChange={(val) => {
                          const current = watchAll.aiUsagePolicy || {};
                          setValue("aiUsagePolicy", { ...current, allowExternalLlm: val }, { shouldDirty: true });
                        }}
                        disabled={isSubmitting}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between bg-surface-1 hover:bg-surface-2/40 transition-colors p-4">
                      <div className="flex items-start gap-3">
                        <EyeSlash weight="duotone" className="w-4 h-4 text-ink-muted mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-ink">Auto-Redact PII</span>
                          <span className="text-[11px] text-ink-muted leading-relaxed">
                            Mask personally identifiable information (emails, phones) before AI processing.
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={watchAll.aiUsagePolicy?.redactPii?.enabled ?? false}
                        onCheckedChange={(val) => {
                          const current = watchAll.aiUsagePolicy || {};
                          setValue("aiUsagePolicy", { ...current, redactPii: { enabled: val } }, { shouldDirty: true });
                        }}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: DLP */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-[11px] font-bold text-ink-subtle uppercase tracking-wider">Data Loss Prevention (DLP)</h4>
                  <div className="rounded-lg border border-hairline overflow-hidden divide-y divide-hairline">
                    <div className="flex items-center justify-between bg-surface-1 hover:bg-surface-2/40 transition-colors p-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck weight="duotone" className="w-4 h-4 text-ink-muted mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-ink">Enable DLP Filtering</span>
                          <span className="text-[11px] text-ink-muted leading-relaxed">
                            Block specific confidential keywords from being processed or stored.
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={watchAll.aiUsagePolicy?.dlp?.enabled ?? false}
                        onCheckedChange={(val) => {
                          const current = watchAll.aiUsagePolicy || {};
                          setValue("aiUsagePolicy", { ...current, dlp: { ...current.dlp, enabled: val } }, { shouldDirty: true });
                        }}
                        disabled={isSubmitting}
                      />
                    </div>
                    {watchAll.aiUsagePolicy?.dlp?.enabled && (
                      <div className="bg-surface-2 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <label className="text-[11px] font-semibold text-ink-muted mb-1.5 block">Restricted Keywords</label>
                        <Input
                          type="text"
                          placeholder="e.g. project-x, secret, confidential (comma separated)"
                          value={watchAll.aiUsagePolicy?.dlp?.keywordsBlacklist?.join(", ") || ""}
                          onChange={(e) => {
                            const keywords = e.target.value.split(",").map(k => k.trim()).filter(Boolean);
                            const current = watchAll.aiUsagePolicy || {};
                            setValue("aiUsagePolicy", { ...current, dlp: { ...current.dlp, enabled: true, keywordsBlacklist: keywords } }, { shouldDirty: true });
                          }}
                          className="h-9 border-hairline focus:ring-1 focus:ring-primary text-[11px] bg-surface-1 font-mono"
                          disabled={isSubmitting}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Translation Rules */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-[11px] font-bold text-ink-subtle uppercase tracking-wider">Localization & Tone</h4>
                  <div className="rounded-lg border border-hairline bg-surface-1 hover:bg-surface-2/40 transition-colors p-4">
                    <div className="flex items-start gap-3 mb-5">
                      <Translate weight="duotone" className="w-4 h-4 text-ink-muted mt-0.5 shrink-0" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-ink">Translation Output Styling</span>
                        <span className="text-[11px] text-ink-muted leading-relaxed">
                          Define standard tone and language-specific honorific rules for the AI.
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-3 pl-7">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-ink-muted">General Tone</label>
                        <Select
                          value={watchAll.aiUsagePolicy?.translationProfile?.translationTone || "default"}
                          onValueChange={(val) => {
                            const current = watchAll.aiUsagePolicy || {};
                            const profile = current.translationProfile || {};
                            setValue("aiUsagePolicy", { ...current, translationProfile: { ...profile, translationTone: val } }, { shouldDirty: true });
                          }}
                        >
                          <SelectTrigger className="h-8 text-[11px] bg-surface-2 border-hairline shadow-sm">
                            <SelectValue placeholder="Select tone..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default" className="text-[11px]">Default</SelectItem>
                            <SelectItem value="casual" className="text-[11px]">Casual</SelectItem>
                            <SelectItem value="formal" className="text-[11px]">Formal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-ink-muted">VN Honorifics</label>
                        <Select
                          value={watchAll.aiUsagePolicy?.translationProfile?.languageSpecificRules?.vietnameseHonorificStyle || "default"}
                          onValueChange={(val) => {
                            const current = watchAll.aiUsagePolicy || {};
                            const profile = current.translationProfile || {};
                            const rules = profile.languageSpecificRules || {};
                            setValue("aiUsagePolicy", { ...current, translationProfile: { ...profile, languageSpecificRules: { ...rules, vietnameseHonorificStyle: val } } }, { shouldDirty: true });
                          }}
                        >
                          <SelectTrigger className="h-8 text-[11px] bg-surface-2 border-hairline shadow-sm">
                            <SelectValue placeholder="Select VN style..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default" className="text-[11px]">Default</SelectItem>
                            <SelectItem value="formal" className="text-[11px]">Formal (Trang trọng)</SelectItem>
                            <SelectItem value="casual" className="text-[11px]">Casual (Thân mật)</SelectItem>
                            <SelectItem value="humble" className="text-[11px]">Humble (Khiêm nhường)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-ink-muted">JP Honorifics</label>
                        <Select
                          value={watchAll.aiUsagePolicy?.translationProfile?.languageSpecificRules?.japaneseHonorificStyle || "default"}
                          onValueChange={(val) => {
                            const current = watchAll.aiUsagePolicy || {};
                            const profile = current.translationProfile || {};
                            const rules = profile.languageSpecificRules || {};
                            setValue("aiUsagePolicy", { ...current, translationProfile: { ...profile, languageSpecificRules: { ...rules, japaneseHonorificStyle: val } } }, { shouldDirty: true });
                          }}
                        >
                          <SelectTrigger className="h-8 text-[11px] bg-surface-2 border-hairline shadow-sm">
                            <SelectValue placeholder="Select JP style..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default" className="text-[11px]">Default</SelectItem>
                            <SelectItem value="keigo" className="text-[11px]">Keigo (敬語)</SelectItem>
                            <SelectItem value="polite" className="text-[11px]">Polite (丁寧語)</SelectItem>
                            <SelectItem value="casual" className="text-[11px]">Casual (タメ口)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-2 border-t border-hairline">
                  <button
                    type="submit"
                    className="flex h-9 w-full sm:w-auto px-6 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50 text-xs sm:self-end cursor-pointer"
                    disabled={isSubmitting || updateSettingsMutation.isPending}
                  >
                    {updateSettingsMutation.isPending ? (
                      <Spinner className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      "Save Policies"
                    )}
                  </button>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>

        {/* Right Side: Verified Domains management and DNS instruction */}
        <div className="flex flex-col gap-6">
          {/* Domains list card */}
          <Card className="border-hairline bg-surface-1 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Verified domains</CardTitle>
              <CardDescription className="text-xs">
                Business domains associated with your organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Add Domain input */}
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="e.g. acme.com"
                    value={newDomain}
                    onChange={(e) => {
                      setNewDomain(e.target.value);
                      setDomainError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
                    className="h-8 border-hairline focus:ring-1 focus:ring-primary text-xs flex-1 bg-surface-2/40"
                  />
                  <button
                    onClick={handleAddDomain}
                    className="h-8 w-8 flex items-center justify-center rounded-md bg-surface-3 border border-hairline text-ink hover:bg-surface-2 transition shrink-0 cursor-pointer"
                    title="Add Domain"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {domainError && (
                  <p className="text-[10px] text-destructive">{domainError}</p>
                )}
              </div>

              {/* Domain List Table */}
              {settingsQuery.isLoading ? (
                <div className="flex h-20 items-center justify-center">
                  <Spinner className="h-4 w-4 animate-spin text-primary" />
                </div>
              ) : !settingsQuery.data?.verifiedDomains || settingsQuery.data.verifiedDomains.length === 0 ? (
                <div className="flex h-20 flex-col items-center justify-center text-center p-3 border border-hairline rounded bg-surface-2">
                  <p className="text-[10px] text-ink-muted">No domains registered.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {settingsQuery.data.verifiedDomains.map((domain) => (
                    <div
                      key={domain}
                      className="flex items-center justify-between p-2 border border-hairline rounded bg-surface-2"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-ink truncate font-mono">
                          {domain}
                        </span>
                        <div className="flex gap-1.5 mt-1">
                          <Badge className="bg-emerald-500/5 text-emerald-500 border border-emerald-500/20 text-[9px] px-1 py-0.2 rounded-sm font-normal">
                            Active
                          </Badge>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveDomain(domain)}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-ink-muted hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0 cursor-pointer"
                        title="Remove Domain"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* DNS verification instructions challenge card */}
          {settingsQuery.data?.verifiedDomains?.map((domain) => (
            <Card key={`dns-${domain}`} className="border-hairline bg-surface-1 shadow-sm">
              <CardHeader className="pb-3 border-b border-hairline">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-primary" />
                  <span>DNS verification: {domain}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-3 flex flex-col gap-3">
                <p className="text-[10px] text-ink-muted leading-normal">
                  To keep the domain verified, please add the following TXT record to your DNS manager (e.g. Cloudflare, GoDaddy).
                </p>
                <div className="rounded-md bg-surface-2 p-2 border border-hairline flex flex-col gap-2 font-mono text-[9px]">
                  <div className="flex justify-between border-b border-hairline pb-1.5">
                    <span className="text-ink-muted">Type:</span>
                    <span className="font-bold text-ink">TXT</span>
                  </div>
                  <div className="flex justify-between border-b border-hairline pb-1.5">
                    <span className="text-ink-muted">Host/Name:</span>
                    <span className="font-bold text-ink">@</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-ink-muted">Value:</span>
                    <div className="flex items-center justify-between gap-2 bg-surface-3 border border-hairline rounded px-1.5 py-1 text-ink font-semibold">
                      <span className="truncate select-all">
                        warptalk-domain-verification={domain.split(".")[0]}-txt-token-99823
                      </span>
                      <button
                        onClick={() => copyTxtValue(domain)}
                        className="text-ink hover:text-primary transition shrink-0 cursor-pointer"
                        title="Copy code"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
