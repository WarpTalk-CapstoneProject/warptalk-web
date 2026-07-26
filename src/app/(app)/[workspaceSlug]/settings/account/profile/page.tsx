"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { authService } from "@/services/auth.service";
import { Input } from "@/components/ui/input";
import { Spinner, Check, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useRemoveWorkspaceMember } from "@/hooks/use-workspace";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updateUser = useAuthStore((s) => s.updateUser);
  const {
    activeWorkspaceId,
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
  const isOwner = role?.toLowerCase() === "owner";

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("vi-VN");
  const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");

  // Leave workspace mutation
  const removeMember = useRemoveWorkspaceMember(activeWorkspaceId || "");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isAuthenticated, router]);

  useEffect(() => {
    if (!mounted || !isAuthenticated || !user) return;

    const currentUserId = user.id;
    const currentUserEmail = user.email;

    async function loadProfile() {
      try {
        const { data } = await authService.getProfile();
        if (data) {
          setFullName(data.fullName || "");
          setPhone(data.phone || "");
          setPreferredLanguage(data.preferredLanguage || "vi-VN");
          setTimezone(data.timezone || "Asia/Ho_Chi_Minh");
        }
      } catch (err) {
        toast.error("Failed to load user profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [mounted, isAuthenticated, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }

    setSaving(true);
    try {
      const { data } = await authService.updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        preferredLanguage,
        timezone,
      });

      if (data && user) {
        // Update local auth store
        updateUser({
          fullName: data.fullName,
          phone: data.phone,
          preferredLanguage: data.preferredLanguage,
          timezone: data.timezone,
        });
        toast.success("Profile updated successfully!");
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || "Failed to update profile";
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveWorkspace = async () => {
    if (!user || !activeWorkspaceId) return;

    const confirmLeave = window.confirm(
      "Are you sure you want to leave this workspace? This action cannot be undone."
    );

    if (confirmLeave) {
      try {
        await removeMember.mutateAsync(user.id);
        toast.success("You have left the workspace.");
        router.push("/workspace");
      } catch (err) {
        toast.error("Failed to leave workspace.");
      }
    }
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
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">
          Profile
        </h1>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-8">
        
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
                disabled={saving}
                className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[240px] focus-visible:ring-1 focus-visible:ring-primary"
              />
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
                disabled={saving}
                className="h-8 text-xs bg-surface-2 border-hairline w-[160px] md:w-[240px] focus-visible:ring-1 focus-visible:ring-primary"
              />
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
            <div className="py-3.5 px-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink">Remove yourself from workspace</span>
              </div>
              <button
                type="button"
                onClick={handleLeaveWorkspace}
                disabled={saving || isOwner}
                title={isOwner ? "Transfer workspace ownership before leaving" : "Leave workspace"}
                className="text-xs font-semibold text-destructive hover:text-red-600 transition-colors cursor-pointer"
              >
                {isOwner ? "Transfer ownership first" : "Leave workspace"}
              </button>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="pt-4 border-t border-hairline flex justify-end gap-3">
          <button
            type="submit"
            className="flex h-8 px-5 items-center justify-center gap-2 rounded bg-primary font-medium text-white transition hover:bg-primary-hover disabled:opacity-50 text-xs cursor-pointer shadow-sm"
            disabled={saving}
          >
            {saving ? (
              <>
                <Spinner className="h-3.5 w-3.5 animate-spin text-white" />
                Saving...
              </>
            ) : (
              <>
                <Check size={14} />
                Save Changes
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
