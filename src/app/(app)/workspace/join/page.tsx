"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAxiosError } from "axios";
import {
  ArrowLeft,
  EnvelopeSimple,
  Lock,
  Spinner,
  CheckCircle,
  WarningCircle,
  Globe,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import { useCreateJoinRequest } from "@/hooks/use-workspace";
import { useRoomPreflight } from "@/hooks/use-translationRooms";
import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { setAccessTokenCookie } from "@/lib/auth/session-cookie";
import type { AuthResponse } from "@/types/auth";

type ApiErrorPayload = {
  error?: string;
};

const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

function getApiError(err: unknown) {
  if (!isAxiosError<ApiErrorPayload>(err)) {
    return { status: undefined, error: "" };
  }

  return {
    status: err.response?.status,
    error: err.response?.data?.error ?? "",
  };
}

export default function JoinWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-canvas">
          <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
        </div>
      }
    >
      <JoinWorkspaceContent />
    </Suspense>
  );
}

function JoinWorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loginAction = useAuthStore((state) => state.login);

  // States
  const [slugOrUrl, setSlugOrUrl] = useState("");
  const mounted = useSyncExternalStore(subscribeMounted, getMountedSnapshot, getServerMountedSnapshot);

  // Auth Form states (minimalist login/register tab)
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Check URL params
  const roomCodeParam = searchParams.get("code") || "";
  const code = useMemo(() => roomCodeParam.trim(), [roomCodeParam]);

  // Preflight checking for code
  const {
    data: preflight,
    isLoading: preflightLoading,
    error: preflightError,
    refetch: refetchPreflight,
  } = useRoomPreflight(code, !!code);

  const createJoinRequestMutation = useCreateJoinRequest();

  useEffect(() => {
    if (mounted && !isAuthenticated && !code) {
      router.replace("/login");
    }
  }, [mounted, isAuthenticated, code, router]);

  // If already member, redirect to join meeting page
  useEffect(() => {
    if (preflight && preflight.isUserMember) {
      toast.info("You are already a member of this workspace.");
      router.replace(`/join?code=${code}`);
    }
  }, [preflight, code, router]);

  // Handle minimalist Login or Register submission
  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Please fill in email and password.");
      return;
    }
    if (authMode === "register" && (!firstName.trim() || !lastName.trim())) {
      toast.error("Please fill in first name and last name.");
      return;
    }

    setAuthLoading(true);
    try {
      if (authMode === "login") {
        const res = await apiClient.post<AuthResponse>(API.auth.login, {
          email: email.trim(),
          password: password.trim(),
        });
        const { user: userDto, accessToken, refreshToken, expiresAt } = res.data;
        loginAction(userDto, accessToken, refreshToken);
        setAccessTokenCookie(accessToken, expiresAt);
        toast.success("Logged in successfully!");
        if (code) {
          refetchPreflight();
        }
      } else {
        const res = await apiClient.post<AuthResponse>(API.auth.register, {
          email: email.trim(),
          password: password.trim(),
          fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
        });
        const { user: userDto, accessToken, refreshToken, expiresAt } = res.data;
        loginAction(userDto, accessToken, refreshToken);
        setAccessTokenCookie(accessToken, expiresAt);
        toast.success("Account created successfully!");
        if (code) {
          refetchPreflight();
        }
      }
    } catch (err: unknown) {
      const { error } = getApiError(err);
      toast.error(error || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Submit Join Request (either Room Code or Slug)
  const handleSendJoinRequest = async (payload: { roomCode?: string; workspaceSlug?: string }) => {
    try {
      await createJoinRequestMutation.mutateAsync(payload);
      toast.success("Join request sent successfully! Waiting for admin approval.");
    } catch (err: unknown) {
      const { status, error: errorMsg } = getApiError(err);

      if (status === 404) {
        toast.error("Workspace không hoạt động hoặc không tồn tại.");
      } else if (status === 403) {
        toast.error("Không thể gửi yêu cầu: Email domain của bạn không khớp với Verified Domains của Workspace.");
      } else if (errorMsg.includes("AlreadyMember") || (status === 400 && errorMsg.includes("member"))) {
        toast.error("Bạn đã là thành viên của Workspace này.");
      } else {
        toast.error(errorMsg || "Failed to submit request.");
      }
    }
  };

  // Manual Slug Submit
  const handleManualSlugSubmit = (e: FormEvent) => {
    e.preventDefault();
    const inputVal = slugOrUrl.trim();
    if (!inputVal) return;

    // Resolve slug from URL if pasted as full link
    let workspaceSlug = inputVal;
    if (workspaceSlug.includes("://")) {
      try {
        const urlObj = new URL(workspaceSlug);
        const paths = urlObj.pathname.split("/").filter(Boolean);
        if (paths.length > 0) {
          if (paths[0] === "workspace" && paths[1]) {
            workspaceSlug = paths[1];
          } else {
            workspaceSlug = paths[0];
          }
        }
      } catch {
        // Fallback if URL parsing fails
      }
    } else {
      const slashParts = workspaceSlug.split("/").filter(Boolean);
      if (slashParts.length > 1) {
        if (slashParts[1] === "workspace" && slashParts[2]) {
          workspaceSlug = slashParts[2];
        } else if (slashParts[0].includes(".") && slashParts[1]) {
          workspaceSlug = slashParts[1];
        }
      }
    }
    workspaceSlug = workspaceSlug.split("?")[0].split("#")[0].trim();

    if (workspaceSlug) {
      void handleSendJoinRequest({ workspaceSlug });
    }
  };

  if (!mounted) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  // Preflight check loading
  if (code && preflightLoading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-canvas gap-3">
        <Spinner className="h-6 w-6 animate-spin text-primary" />
        <p className="text-[13px] text-ink-muted">Verifying room and workspace access...</p>
      </div>
    );
  }

  // Preflight check error
  if (code && preflightError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-start bg-canvas px-4 pt-[15vh] pb-12 text-ink">
        <div className="w-full max-w-[420px] bg-surface-1 border border-border p-6 rounded-[8px] shadow-linear text-center space-y-4">
          <div className="flex justify-center text-red-500">
            <WarningCircle size={48} weight="light" />
          </div>
          <h2 className="text-[18px] font-semibold text-foreground">Không thể tiếp cận phòng họp</h2>
          <p className="text-[13px] text-ink-muted leading-relaxed">
            Phòng họp hoặc Workspace không hoạt động hoặc không tồn tại.
          </p>
          <Button onClick={() => router.push("/")} className="w-full bg-foreground text-white">
            Quay lại Trang chủ
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-start bg-canvas px-4 pt-[10vh] pb-12 text-ink font-sans select-none antialiased">
      <div className="w-full max-w-[420px] flex flex-col gap-6">

        {/* Back Button */}
        <div className="flex items-center justify-between text-[12px] text-ink-muted font-medium">
          <button
            type="button"
            onClick={() => router.push(code ? `/join?code=${code}` : "/workspace")}
            className="flex items-center gap-1.5 hover:text-ink transition-colors cursor-pointer"
          >
            <ArrowLeft size={13} />
            Back
          </button>
          {isAuthenticated && <span className="truncate text-ink-muted">{user?.email}</span>}
        </div>

        {/* ──────── SCENARIO A: ROOM CODE REDIRECT ──────── */}
        {code && preflight && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-[26px] font-semibold tracking-tight text-foreground leading-snug">
                {preflight.workspaceName ? `Join ${preflight.workspaceName}` : "Join Enterprise Workspace"}
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-muted">
                To enter room <span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-[12px]">{code}</span>, you must join this workspace first.
              </p>
            </div>

            {/* UN-AUTHENTICATED: Minimalist Login/Register Form */}
            {!isAuthenticated ? (
              <div className="bg-surface-1 border border-border rounded-[8px] p-5 shadow-linear">
                {/* Tab Switcher */}
                <div className="flex border-b border-border/50 mb-4 text-[13px]">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={`flex-1 pb-2 font-medium border-b-2 text-center transition-colors ${
                      authMode === "login" ? "border-primary text-foreground" : "border-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("register")}
                    className={`flex-1 pb-2 font-medium border-b-2 text-center transition-colors ${
                      authMode === "register" ? "border-primary text-foreground" : "border-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {authMode === "register" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-ink-muted">First Name</label>
                        <Input
                          placeholder="First Name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="bg-canvas border-border text-[13px] h-[34px]"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-ink-muted">Last Name</label>
                        <Input
                          placeholder="Last Name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="bg-canvas border-border text-[13px] h-[34px]"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-ink-muted">Email Address</label>
                    <div className="relative">
                      <EnvelopeSimple className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" />
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-canvas border-border pl-9 text-[13px] h-[34px]"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-ink-muted">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" />
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-canvas border-border pl-9 text-[13px] h-[34px]"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-foreground text-white text-[13px] font-medium h-[34px] rounded-[6px] hover:opacity-95 transition-opacity mt-2"
                  >
                    {authLoading ? <Spinner className="w-4 h-4 animate-spin" /> : authMode === "login" ? "Sign In" : "Sign Up"}
                  </Button>
                </form>
              </div>
            ) : (
              /* AUTHENTICATED: Show Workspace detail and Request join button */
              <div className="space-y-4">
                <div className="bg-surface-1 border border-border rounded-[8px] p-5 shadow-linear space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[6px] bg-primary/10 flex items-center justify-center text-primary font-bold text-[18px]">
                      {preflight.workspaceName ? preflight.workspaceName.charAt(0).toUpperCase() : "W"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-[14px] text-foreground truncate">
                        {preflight.workspaceName || "Enterprise Workspace"}
                      </h4>
                      <p className="text-[12px] text-ink-muted truncate">
                        Slug: {preflight.workspaceSlug || "n/a"}
                      </p>
                    </div>
                  </div>

                  {/* Security Boundaries Alert */}
                  {(!preflight.isDomainMatched && !preflight.allowExternalCollaboration) ? (
                    <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-[6px] flex items-start gap-2.5">
                      <WarningCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-[12px] text-red-500/90 leading-relaxed font-medium">
                        Gửi yêu cầu bị vô hiệu hóa do email của bạn không khớp với tên miền của Workspace. Vui lòng liên hệ trực tiếp với ban tổ chức.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-primary/5 border border-primary/10 rounded-[6px] flex items-start gap-2.5">
                      <Globe className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-[12px] text-primary/90 leading-relaxed">
                        Your account {preflight.isDomainMatched ? "matches the verified domain" : "will join as an external collaborator"}.
                      </p>
                    </div>
                  )}

                  {createJoinRequestMutation.isSuccess ? (
                    <div className="p-3 bg-semantic-success/5 border border-semantic-success/15 rounded-[6px] flex items-start gap-2.5">
                      <CheckCircle className="w-4 h-4 text-semantic-success shrink-0 mt-0.5" />
                      <p className="text-[12px] text-semantic-success/90 font-medium">
                        Yêu cầu gia nhập đã được gửi tới Admin. Vui lòng chờ phê duyệt.
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleSendJoinRequest({ roomCode: code })}
                      disabled={
                        createJoinRequestMutation.isPending ||
                        (!preflight.isDomainMatched && !preflight.allowExternalCollaboration)
                      }
                      className="w-full bg-foreground text-white text-[13px] font-medium h-[36px] rounded-[6px] hover:opacity-95 transition-opacity"
                    >
                      {createJoinRequestMutation.isPending ? (
                        <Spinner className="w-4 h-4 animate-spin" />
                      ) : (
                        "Send Join Request to Workspace Admin"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ──────── SCENARIO B: NO ROOM CODE (MANUAL SLUG INPUT) ──────── */}
        {!code && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-[28px] font-semibold tracking-tight text-foreground text-balance">
                Request to join
              </h1>
              <p className="mt-1 text-[13px] text-ink-muted">
                Enter the workspace URL or slug to request access
              </p>
            </div>

            <form onSubmit={handleManualSlugSubmit} className="bg-surface-1 border border-border rounded-[8px] p-5 shadow-linear space-y-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="workspace-slug" className="text-[12px] font-medium text-ink-muted">
                  Workspace URL or Slug
                </label>
                <Input
                  id="workspace-slug"
                  placeholder="e.g. acme or warptalk.app/workspace/acme"
                  value={slugOrUrl}
                  onChange={(e) => setSlugOrUrl(e.target.value)}
                  className="bg-canvas border-border text-[13px] h-[36px] focus-visible:ring-1 focus-visible:ring-primary outline-none"
                  required
                />
              </div>

              {createJoinRequestMutation.isSuccess ? (
                <div className="p-3 bg-semantic-success/5 border border-semantic-success/15 rounded-[6px] flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-semantic-success shrink-0" />
                  <p className="text-[12px] text-semantic-success/90 font-medium">
                    Yêu cầu gia nhập đã được gửi thành công!
                  </p>
                </div>
              ) : (
                <Button
                  type="submit"
                  disabled={!slugOrUrl.trim() || createJoinRequestMutation.isPending}
                  className="w-full bg-foreground text-white text-[13px] font-medium h-[36px] rounded-[6px] hover:opacity-95 transition-opacity"
                >
                  {createJoinRequestMutation.isPending ? (
                    <Spinner className="w-4 h-4 animate-spin" />
                  ) : (
                    "Send Join Request to Workspace Admin"
                  )}
                </Button>
              )}
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
