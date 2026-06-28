"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { authService } from "@/services/auth.service";
import { Input } from "@/components/ui/input";
import { Spinner, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("vi-VN");
  const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isAuthenticated, router]);

  useEffect(() => {
    if (!mounted || !isAuthenticated) return;

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
  }, [mounted, isAuthenticated]);

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

      if (data) {
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

  if (!mounted || !isAuthenticated || loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[640px] mx-auto w-full px-4 py-6 text-ink select-none font-sans antialiased">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
          Personal Profile Settings
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Manage your personal display details, language preferences, and timezone context.
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6 rounded-xl border border-hairline/30 bg-surface-1/40 p-6 shadow-sm">
        {/* Name Input */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-xs font-semibold text-ink-muted">
            Full Name
          </label>
          <Input
            id="fullName"
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={saving}
            className="h-10 border-hairline bg-surface-2/40 text-[13px] px-3 focus-visible:ring-1 focus-visible:ring-primary rounded-md"
          />
        </div>

        {/* Email Input (Read Only) */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-semibold text-ink-muted">
            Email address
          </label>
          <div className="relative">
            <Input
              id="email"
              value={user?.email || ""}
              readOnly
              disabled
              className="h-10 border-hairline bg-surface-2/20 text-[13px] px-3 font-mono opacity-60 rounded-md"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-surface-3/40 px-2 py-0.5 text-[10px] text-ink-muted">
              <ShieldCheck size={12} className="text-emerald-500" />
              Verified
            </span>
          </div>
          <p className="text-[10px] text-ink-muted">Your email address is managed by your enterprise system and cannot be changed.</p>
        </div>

        {/* Phone Input */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-xs font-semibold text-ink-muted">
            Phone Number
          </label>
          <Input
            id="phone"
            placeholder="e.g. +84 987654321"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={saving}
            className="h-10 border-hairline bg-surface-2/40 text-[13px] px-3 focus-visible:ring-1 focus-visible:ring-primary rounded-md"
          />
        </div>

        {/* Language select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-muted">Preferred Language</label>
          <Select value={preferredLanguage} onValueChange={(val) => setPreferredLanguage(val || "vi-VN")} disabled={saving}>
            <SelectTrigger className="h-10 text-[13px] bg-surface-2/40 border-hairline rounded-md">
              <SelectValue placeholder="Select language..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi-VN" className="text-xs">Vietnamese (vi-VN)</SelectItem>
              <SelectItem value="en-US" className="text-xs">English (en-US)</SelectItem>
              <SelectItem value="ja-JP" className="text-xs">Japanese (ja-JP)</SelectItem>
              <SelectItem value="ko-KR" className="text-xs">Korean (ko-KR)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Timezone select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-muted">Timezone</label>
          <Select value={timezone} onValueChange={(val) => setTimezone(val || "Asia/Ho_Chi_Minh")} disabled={saving}>
            <SelectTrigger className="h-10 text-[13px] bg-surface-2/40 border-hairline rounded-md">
              <SelectValue placeholder="Select timezone..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Asia/Ho_Chi_Minh" className="text-xs">Asia/Ho_Chi_Minh (GMT+7)</SelectItem>
              <SelectItem value="Asia/Tokyo" className="text-xs">Asia/Tokyo (GMT+9)</SelectItem>
              <SelectItem value="Asia/Seoul" className="text-xs">Asia/Seoul (GMT+9)</SelectItem>
              <SelectItem value="UTC" className="text-xs">UTC (Greenwich Mean Time)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <button
          type="submit"
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50 text-[13px] cursor-pointer"
          disabled={saving}
        >
          {saving ? (
            <>
              <Spinner className="h-4 w-4 animate-spin text-white" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </button>
      </form>
    </div>
  );
}
