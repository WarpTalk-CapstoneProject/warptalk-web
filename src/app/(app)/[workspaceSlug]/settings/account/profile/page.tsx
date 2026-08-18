"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { authService } from "@/services/auth.service";
import { Input } from "@/components/ui/input";
import { Spinner, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAutoSaveQueue } from "@/hooks/use-auto-save";
import { AutoSaveStatusBadge } from "@/components/features/settings/auto-save-status-badge";
import type { UpdateProfileRequest } from "@/types/auth";
import {
  DEFAULT_PROFILE_LANGUAGE,
  getDefaultProfileTimezone,
  getProfileLanguageOptions,
  getSupportedTimezoneOptions,
} from "@/lib/format/profile-localization";
import { LanguageLabel } from "@/components/language/language-label";
import { describeTimeZone, isSameTimeZone } from "@/lib/format/time-zones";

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updateUser = useAuthStore((s) => s.updateUser);
  const {
    activeWorkspaceName,
    role,
    membershipType,
  } = useWorkspaceStore();
  const displayRole = role
    ? `${role.charAt(0).toUpperCase()}${role.slice(1).toLowerCase()}`
    : "Member";
  const displayMembershipType = membershipType
    ? `${membershipType.charAt(0).toUpperCase()}${membershipType.slice(1).toLowerCase()}`
    : "Internal";

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const loadedUserRef = useRef<string | null>(null);
  const lastQueuedValuesRef = useRef<Record<string, string>>({});

  // Form State
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState(DEFAULT_PROFILE_LANGUAGE);
  const [timezone, setTimezone] = useState(getDefaultProfileTimezone);
  const languageOptions = useMemo(() => {
    const options = getProfileLanguageOptions();
    return options.some((option) => option.value === preferredLanguage)
      ? options
      : [{ value: preferredLanguage, label: preferredLanguage }, ...options];
  }, [preferredLanguage]);
  const timezoneOptions = useMemo(() => {
    const options = getSupportedTimezoneOptions();
    // `isSameTimeZone`, not `includes`. IANA carries Links as well as Zones, and this platform
    // canonicalises Vietnam to Asia/Saigon while the accounts database defaults every user to
    // Asia/Ho_Chi_Minh — a raw string compare therefore prepends the stored spelling and the
    // list shows the same place twice, as two options that do different things to neither.
    return options.some((option) => isSameTimeZone(option, timezone))
      ? options
      : [timezone, ...options];
  }, [timezone]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isAuthenticated, router]);

  useEffect(() => {
    if (!mounted || !isAuthenticated || !user) return;

    if (loadedUserRef.current === user.id) return;
    const userId = user.id;

    async function loadProfile() {
      try {
        const { data } = await authService.getProfile();
        if (data) {
          setFullName(data.fullName || "");
          setPhone(data.phone || "");
          const nextPreferredLanguage = data.preferredLanguage || DEFAULT_PROFILE_LANGUAGE;
          const nextTimezone = data.timezone || getDefaultProfileTimezone();
          setPreferredLanguage(nextPreferredLanguage);
          setTimezone(nextTimezone);
          lastQueuedValuesRef.current = {
            fullName: JSON.stringify(data.fullName || ""),
            phone: JSON.stringify(data.phone || ""),
            preferredLanguage: JSON.stringify(nextPreferredLanguage),
            timezone: JSON.stringify(nextTimezone),
          };
          loadedUserRef.current = userId;
        }
      } catch {
        toast.error("Failed to load user profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [mounted, isAuthenticated, user]);

  const saveProfile = useCallback(async (patch: UpdateProfileRequest) => {
    const { data } = await authService.updateProfile(patch);
    updateUser({
      fullName: data.fullName,
      phone: data.phone,
      preferredLanguage: data.preferredLanguage,
      timezone: data.timezone,
    });
    return data;
  }, [updateUser]);

  const autoSave = useAutoSaveQueue<UpdateProfileRequest>({
    save: saveProfile,
    onError: (error) => {
      const errorMsg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || "Failed to update profile";
      setProfileError(errorMsg);
      toast.error(errorMsg);
    },
  });

  const retryProfileSave = () => {
    setProfileError(null);
    autoSave.retry();
  };

  const queueProfileField = (field: keyof UpdateProfileRequest, value: string) => {
    const normalizedValue = field === "fullName" || field === "phone" ? value.trim() : value;
    if (field === "fullName" && !normalizedValue) {
      setProfileError("Full name is required");
      return;
    }
    setProfileError(null);
    const serializedValue = JSON.stringify(normalizedValue);
    if (lastQueuedValuesRef.current[field] === serializedValue) return;
    lastQueuedValuesRef.current[field] = serializedValue;
    autoSave.enqueue({ [field]: normalizedValue });
  };

  const commitTextField = (field: "fullName" | "phone", value: string) => {
    if (field === "fullName") setFullName(value);
    else setPhone(value);
    queueProfileField(field, value);
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (!mounted || !isAuthenticated || loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4 flex flex-col gap-8 text-ink">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight text-ink">Profile</h1>
        <AutoSaveStatusBadge
          status={profileError ? "error" : autoSave.status}
          invalid={Boolean(profileError)}
          onRetry={profileError === "Full name is required" ? undefined : retryProfileSave}
        />
      </div>

      <div className="flex flex-col gap-8">
        
        {/* Section 1: User Profile Settings */}
        <div className="flex flex-col gap-3">
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            
            {/* Profile Picture */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Profile picture</span>
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="size-8 rounded-full border border-border">
                  <AvatarImage src={user?.avatarUrl} alt={fullName} />
                  <AvatarFallback className="rounded-full bg-sky-500 text-white text-xs font-semibold">
                    {getInitials(fullName)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* Email Address */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Email</span>
              </div>
              <div className="relative flex items-center w-[160px] md:w-[240px]">
                <Input
                  id="email"
                  value={user?.email || ""}
                  readOnly
                  disabled
                  className="h-8 text-xs bg-surface-2/20 border-hairline font-mono opacity-60 w-full pr-8"
                />
                <span className="absolute right-2.5 text-ink-muted/50 cursor-not-allowed" title="Email cannot be changed">
                  <PencilSimple size={12} />
                </span>
              </div>
            </div>

            {/* Full Name */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Full name</span>
              </div>
              <Input
                id="fullName"
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={(e) => commitTextField("fullName", e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTextField("fullName", e.currentTarget.value);
                    e.currentTarget.blur();
                  }
                }}
                className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[240px] focus-visible:ring-1 focus-visible:ring-primary"
              />
              {profileError === "Full name is required" && (
                <span className="text-[11px] text-destructive">{profileError}</span>
              )}
            </div>

            {/* Phone Number */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Phone number</span>
              </div>
              <Input
                id="phone"
                placeholder="e.g. +84 987654321"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={(e) => commitTextField("phone", e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTextField("phone", e.currentTarget.value);
                    e.currentTarget.blur();
                  }
                }}
                className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[240px] focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            {/* Preferred language */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Preferred language</span>
              </div>
              <Select
                value={preferredLanguage}
                onValueChange={(val) => {
                  if (val) {
                    setPreferredLanguage(val);
                    queueProfileField("preferredLanguage", val);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[240px]">
                  <SelectValue>
                    {(value) =>
                      value ? <LanguageLabel value={String(value)} /> : "Select language"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timezone */}
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Timezone</span>
              </div>
              <Select
                value={timezone}
                onValueChange={(val) => {
                  if (val) {
                    setTimezone(val);
                    queueProfileField("timezone", val);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[240px]">
                  <SelectValue>
                    {(value) => (value ? describeTimeZone(String(value)) : "Select timezone")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((option) => (
                    <SelectItem key={option} value={option} className="text-xs">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
        </div>

        {/* Section 2: Workspace Access */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Workspace access
          </div>
          <div className="border border-hairline bg-surface-1 rounded-lg overflow-hidden divide-y divide-hairline">
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold text-ink">Workspace</span>
              <span className="max-w-[240px] truncate text-xs font-medium text-ink-muted">
                {activeWorkspaceName || "Current workspace"}
              </span>
            </div>
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold text-ink">Workspace role</span>
              <span className="rounded-[4px] border border-hairline bg-surface-2 px-2 py-1 text-[11px] font-semibold text-ink">
                {displayRole}
              </span>
            </div>
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold text-ink">Membership type</span>
              <span className="rounded-[4px] border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary">
                {displayMembershipType}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
