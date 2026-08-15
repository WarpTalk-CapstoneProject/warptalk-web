"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Eye,
  EyeClosed,
  Spinner,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import gsap from "gsap";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { GoogleAuthIcon } from "@/components/auth/cinematic-auth-shell";
import { BlurText } from "@/components/visuals/blur-text";
import { LineWaves } from "@/components/visuals/line-waves";
import { Checkbox } from "@/components/ui/checkbox";
import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { setAccessTokenCookie } from "@/lib/auth/session-cookie";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
type ScreenMode = "welcome" | "login";
type ExternalBridge = {
  openExternal?: (url: string) => Promise<void>;
};

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
const CONTACT_URL =
  process.env.NEXT_PUBLIC_CONTACT_URL?.trim() ?? "https://warptalk.vn/#contact";

function getSafeCallbackUrl(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value === "/rooms"
  ) {
    return "/workspace";
  }

  return value;
}

function openContactPage() {
  const bridge = window as Window & { warptalk?: ExternalBridge };

  if (bridge.warptalk?.openExternal) {
    void bridge.warptalk.openExternal(CONTACT_URL);
    return;
  }

  window.open(CONTACT_URL, "_blank", "noopener,noreferrer");
}

function GoogleLoginButton({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const idToken = tokenResponse.access_token;
        const res = await apiClient.post<AuthResponse>(API.auth.googleLogin, {
          idToken,
        });
        const { user, accessToken, expiresAt } = res.data;

        login(user, accessToken);
        setAccessTokenCookie(accessToken, expiresAt);

        const isAdmin = user.roles?.some(
          (role: string) => role.toLowerCase() === "admin",
        );
        if (isAdmin && callbackUrl === "/workspace/dashboard") {
          router.replace("/dashboard");
        } else {
          router.replace(callbackUrl);
        }
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } } };
        toast.error(
          error?.response?.data?.error ||
            "Google login failed. Please try again.",
        );
      }
    },
    onError: () => {
      toast.error("Google authentication failed or popup was closed.");
    },
  });

  return (
    <button
      type="button"
      onClick={() => handleGoogleLogin()}
      className="flex h-14 w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white text-[15px] font-semibold text-black transition hover:bg-white/90"
      data-login-field
    >
      <GoogleAuthIcon className="size-5" />
      Continue with Google
    </button>
  );
}

function GoogleLoginUnavailableButton() {
  return (
    <button
      type="button"
      disabled
      title="Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google login."
      className="flex h-14 w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-white/10 bg-white/10 text-[15px] font-semibold text-white/45"
      data-login-field
    >
      <GoogleAuthIcon className="size-5 opacity-60" />
      Continue with Google
    </button>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(
    searchParams.get("callbackUrl") || searchParams.get("redirect"),
  );
  const login = useAuthStore((s) => s.login);
  // This route is the desktop app's entry point, so it opens on the login form
  // rather than the welcome splash, which is still reachable via Back.
  const [screen, setScreen] = useState<ScreenMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"email" | "password">("email");
  const shellRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasSensitiveParams =
      url.searchParams.has("email") || url.searchParams.has("password");
    if (!hasSensitiveParams) return;

    url.searchParams.delete("email");
    url.searchParams.delete("password");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  useEffect(() => {
    document.title =
      screen === "welcome" ? "Warptalk-V1 | Welcome" : "Warptalk-V1 | Login";
  }, [screen]);

  useLayoutEffect(() => {
    if (!shellRef.current) return;

    const ctx = gsap.context(() => {
      if (screen === "welcome") {
        gsap.fromTo(
          "[data-welcome-title]",
          { y: 26, opacity: 0, filter: "blur(18px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            duration: 1,
            ease: "power4.out",
          },
        );
        gsap.fromTo(
          "[data-welcome-action]",
          { y: 18, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            stagger: 0.1,
            delay: 0.3,
            ease: "power3.out",
          },
        );
      } else {
        gsap.fromTo(
          "[data-login-card]",
          { y: 26, opacity: 0, scale: 0.98 },
          {
            y: 0,
            opacity: 1,
            scale: 1,
            duration: 0.8,
            ease: "power4.out",
          },
        );
        gsap.fromTo(
          "[data-login-field]",
          { y: 12, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.55,
            stagger: 0.07,
            delay: 0.12,
            ease: "power3.out",
          },
        );
      }
    }, shellRef);

    return () => ctx.revert();
  }, [screen, step]);

  const onSubmit = async (data: LoginFormData) => {
    if (step === "email") {
      const isEmailValid = await trigger("email");
      if (isEmailValid) {
        setStep("password");
      }
      return;
    }

    if (!data.password || data.password.length < 6) {
      setError("password", {
        message: "Password must be at least 6 characters",
      });
      return;
    }

    try {
      const res = await apiClient.post<AuthResponse>(API.auth.login, {
        email: data.email,
        password: data.password,
      });
      const { user, accessToken, expiresAt } = res.data;

      login(user, accessToken);
      setAccessTokenCookie(accessToken, expiresAt);

      const isAdmin = user.roles?.some(
        (role: string) => role.toLowerCase() === "admin",
      );
      if (isAdmin && callbackUrl === "/workspace/dashboard") {
        router.replace("/dashboard");
      } else {
        router.replace(callbackUrl);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(
        error?.response?.data?.error || "Login failed. Please try again.",
      );
    }
  };

  return (
    <div
      ref={shellRef}
      className="relative min-h-[100dvh] overflow-hidden bg-[#0d0a08] text-white"
    >
      <LineWaves
        speed={0.3}
        innerLineCount={34}
        outerLineCount={42}
        warpIntensity={1}
        rotation={-45}
        edgeFadeWidth={0}
        colorCycleSpeed={0.8}
        brightness={0.24}
        scale={1.05}
        color1="#ffffff"
        color2="#f2dfcd"
        color3="#ffffff"
        mouseInfluence={2.3}
        mouseSpread={3.4}
        className="opacity-100"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.04),rgba(14,12,10,0.18)_42%,rgba(9,8,7,0.78)_88%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.08),rgba(0,0,0,0.22)_68%,rgba(0,0,0,0.52))]" />

      <main className="relative z-10 flex min-h-[100dvh] flex-col items-center px-5 py-7">
        <AnimatePresence mode="wait">
          {screen === "welcome" ? (
            <motion.section
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.35 }}
              className="flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col items-center text-center"
            >
              <nav
                className="mb-auto flex h-16 w-full max-w-[950px] items-center justify-between rounded-[20px] border border-white/12 bg-white/[0.11] px-5 text-white shadow-[0_20px_80px_rgba(0,0,0,0.2)] backdrop-blur-xl"
                data-welcome-action
              >
                <span className="inline-flex size-9 items-center justify-center rounded-full border border-white/14 bg-black/10">
                  <span className="relative block size-5 overflow-hidden rounded-sm">
                    <Image
                      src="/assets/logos/warptalk-icon-gradient-large.jpg"
                      alt="Warptalk"
                      fill
                      priority
                      sizes="20px"
                      className="object-contain"
                    />
                  </span>
                </span>

                <div className="hidden items-center gap-7 text-sm font-semibold text-white/52 sm:flex">
                  <button
                    type="button"
                    onClick={() => setScreen("login")}
                    className="transition hover:text-white"
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={openContactPage}
                    className="transition hover:text-white"
                  >
                    Contact
                  </button>
                </div>
              </nav>

              <div className="flex flex-1 flex-col items-center justify-center pb-14 pt-10">
                <div
                  className="mb-8 inline-flex items-center rounded-full border border-white/12 bg-white/[0.08] p-1 text-sm font-semibold text-white/48 backdrop-blur-md"
                  data-welcome-action
                >
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-black">
                    NEW
                  </span>
                  <span className="px-3">Warptalk desktop v1</span>
                </div>

              <header data-welcome-title className="mb-8">
                <BlurText
                  text="Welcome back to WarpTalk"
                  animateBy="words"
                  direction="top"
                  threshold={0.1}
                  stepDuration={0.3}
                  className="mx-auto max-w-7xl justify-center text-balance text-[clamp(2.35rem,4.1vw,4.35rem)] font-semibold leading-[1.04] text-white drop-shadow-[0_18px_45px_rgba(0,0,0,0.62)]"
                />
              </header>

              <div className="flex w-full max-w-[360px] flex-col justify-center gap-4 sm:max-w-none sm:flex-row">
                <button
                  type="button"
                  onClick={() => setScreen("login")}
                  className="h-14 min-w-[140px] rounded-[12px] bg-white px-7 text-base font-semibold text-black shadow-[0_18px_48px_rgba(255,255,255,0.16)] transition hover:bg-white/90"
                  data-welcome-action
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={openContactPage}
                  className="h-14 min-w-[150px] rounded-[12px] border border-white/14 bg-white/[0.08] px-7 text-base font-semibold text-white/60 backdrop-blur-md transition hover:bg-white/14 hover:text-white"
                  data-welcome-action
                >
                  Contact us
                </button>
              </div>
              </div>
            </motion.section>
          ) : (
            <motion.section
              key="login"
              data-login-card
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-[460px] rounded-[22px] border border-white/14 bg-[#11100f]/78 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:p-7"
            >
              <button
                type="button"
                onClick={() => {
                  setScreen("welcome");
                  setStep("email");
                }}
                className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-white/60 transition hover:text-white"
                data-login-field
              >
                <ArrowLeft size={17} />
                Back
              </button>

              <div className="mb-7">
                <p className="mb-2 text-sm font-medium text-white/50">
                  Warptalk-V1
                </p>
                <h1 className="text-3xl font-semibold tracking-normal text-white">
                  Sign in
                </h1>
              </div>

              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
                noValidate
              >
                <AnimatePresence mode="wait">
                  {step === "email" ? (
                    <motion.div
                      key="email-step"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      {GOOGLE_CLIENT_ID ? (
                        <GoogleLoginButton callbackUrl={callbackUrl} />
                      ) : (
                        <GoogleLoginUnavailableButton />
                      )}

                      <div className="flex items-center gap-4 py-1">
                        <div className="h-px flex-1 bg-white/12" />
                        <span className="text-[11px] font-medium uppercase tracking-wider text-white/38">
                          Or
                        </span>
                        <div className="h-px flex-1 bg-white/12" />
                      </div>

                      <div className="space-y-2" data-login-field>
                        <input
                          type="email"
                          autoComplete="email"
                          autoFocus
                          placeholder="Email address"
                          className={cn(
                            "h-14 w-full rounded-full border border-white/12 bg-white/10 px-5 text-[15px] text-white outline-none transition placeholder:text-white/36 focus:border-white/55 focus:ring-1 focus:ring-white/25",
                            errors.email &&
                              "border-[#ff6b5f] focus:border-[#ff6b5f] focus:ring-[#ff6b5f]",
                          )}
                          {...register("email")}
                        />
                        {errors.email && (
                          <div className="flex items-center gap-1.5 text-[#ff8a80]">
                            <WarningCircle size={16} />
                            <p className="text-[13px] font-medium">
                              {errors.email.message}
                            </p>
                          </div>
                        )}
                      </div>

                      <button
                        type="submit"
                        className="flex h-14 w-full items-center justify-center rounded-full bg-white text-[15px] font-semibold text-black transition hover:bg-white/90"
                        data-login-field
                      >
                        Continue
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="password-step"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      <div
                        className="flex h-14 w-full items-center justify-between rounded-full border border-white/12 bg-white/10 px-5"
                        data-login-field
                      >
                        <span className="truncate pr-4 text-[15px] text-white/85">
                          {getValues("email")}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStep("email")}
                          className="text-[14px] font-medium text-white/70 hover:text-white hover:underline"
                        >
                          Edit
                        </button>
                      </div>

                      <div className="space-y-2" data-login-field>
                        <div className="relative block">
                          <input
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            autoFocus
                            placeholder="Password"
                            className={cn(
                              "h-14 w-full rounded-full border border-white/12 bg-white/10 px-5 pr-12 text-[15px] text-white outline-none transition placeholder:text-white/36 focus:border-white/55 focus:ring-1 focus:ring-white/25",
                              errors.password &&
                                "border-[#ff6b5f] focus:border-[#ff6b5f] focus:ring-[#ff6b5f]",
                            )}
                            {...register("password")}
                          />
                          <button
                            type="button"
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/45 transition-colors hover:text-white"
                            onClick={() => setShowPassword((value) => !value)}
                          >
                            {showPassword ? (
                              <EyeClosed weight="regular" size={20} />
                            ) : (
                              <Eye weight="regular" size={20} />
                            )}
                          </button>
                        </div>
                        {errors.password && (
                          <div className="flex items-center gap-1.5 text-[#ff8a80]">
                            <WarningCircle size={16} />
                            <p className="text-[13px] font-medium">
                              {errors.password.message}
                            </p>
                          </div>
                        )}
                      </div>

                      <div
                        className="flex items-center justify-between pt-1 text-[13px]"
                        data-login-field
                      >
                        <label className="flex items-center gap-2 text-white/65">
                          <Checkbox className="size-[14px] rounded-sm border-white/25 data-[state=checked]:bg-white data-[state=checked]:text-black" />
                          Keep me logged in
                        </label>
                        <button
                          type="button"
                          onClick={openContactPage}
                          className="font-medium text-white/65 hover:text-white hover:underline"
                        >
                          Contact us
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex h-14 w-full items-center justify-center rounded-full bg-white text-[15px] font-semibold text-black transition hover:bg-white/90 disabled:pointer-events-none disabled:opacity-70"
                        data-login-field
                      >
                        {isSubmitting ? (
                          <Spinner weight="bold" className="animate-spin" />
                        ) : (
                          "Log In"
                        )}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-20 grid place-items-center bg-[#0d0a08]">
          <Spinner
            weight="bold"
            className="animate-spin text-white"
            size={32}
          />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
