"use client";

/**
 * Signing up: three steps, in the same room as the login page.
 *
 * WHY IT WAS REBUILT RATHER THAN TIDIED
 *   This page was the dark `CinematicAuthShell` — black background, white-on-black card, 12px
 *   rounded inputs, a two-column first/last name grid. The login page it sits next to is white,
 *   with an animated halftone field, 56px pill inputs and a black pill button. They are not two
 *   themes of one product; they are two products. A visitor arriving from "Create account" on the
 *   login page watched the entire page invert. Nothing of the old shell survives here, and the
 *   layout below is deliberately the login page's own, down to the input height.
 *
 * WHY THREE STEPS AND NOT ONE FORM
 *   The account used to be an email and a password, and nothing else was ever asked. That was
 *   fine right up until the first meeting, which reads `default_speak_language` /
 *   `default_listen_language` off the user's settings row to decide what language you speak and
 *   hear — so every new account joined its first meeting in the platform default, and the only
 *   way to find out was to notice it mid-meeting and go hunting for a settings page. The
 *   languages are asked for here because there is no later: self-registration returns NO SESSION
 *   (BR-02 — the address has to be proven first), so between "account created" and "first
 *   meeting" the client has no token with which to save anything. They travel with the register
 *   call itself; see AuthDtos.RegisterRequest.
 *
 *   One long form would have worked too, and would have been worse: the login page next door
 *   already asks one question per screen, and a sign-up form that opens with six fields is the
 *   thing people close.
 *
 * THE INVITED PATH
 *   An invitation carries the address, so step 1 is skipped — but not step 3. Being invited says
 *   nothing about what language you speak.
 *
 * GOOGLE IS STILL A GAP
 *   Continue with Google creates the account without passing through here at all, so those
 *   accounts still land on the platform default languages. That needs its own first-run prompt
 *   inside the app; it is not something this page can reach.
 */

import { Suspense, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { CaretLeft, Eye, EyeClosed, Spinner, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "motion/react";
import { Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { useGoogleLogin } from "@react-oauth/google";

import { AnimatedHalftone } from "@/components/auth/animated-halftone";
import { GoogleAuthIcon } from "@/components/auth/cinematic-auth-shell";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { setAccessTokenCookie } from "@/lib/auth/session-cookie";
import { languagesInScope } from "@/lib/language/languages";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/auth";

function getSafeCallbackUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value === "/rooms") return "/workspace";
  return value;
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

/**
 * The same catalogue the pre-join screen and the room settings offer. Sign-up must not present a
 * language a meeting cannot then be held in.
 */
const MEETING_LANGUAGES = languagesInScope("meeting");

/**
 * The server's own fallbacks (AuthService UserConstants). Pre-filling with them means the step
 * opens showing what the account would get if it were skipped, rather than a guess — and the
 * pair is deliberately vi-VN → en-US rather than the same language twice, because a translation
 * product whose sign-up defaults to speaking and hearing one language demonstrates nothing.
 */
const DEFAULT_SPEAK = "vi-VN";
const DEFAULT_LISTEN = "en-US";

const getRegisterSchema = (hasToken: boolean, tv: ReturnType<typeof useTranslations>) =>
  z.object({
    email: hasToken
      ? z.string().optional().or(z.literal(""))
      : z.string().min(1, tv("emailRequired")).email(tv("emailInvalid")),
    fullName: z.string().min(1, tv("fullNameRequired")),
    password: z.string().min(8, tv("passwordMin8")),
  });

type RegisterFormData = {
  email?: string;
  fullName: string;
  password: string;
};

type Step = "email" | "details" | "languages";

/** What POST /auth/register returns when the address still has to be proven (BR-02). */
interface PendingVerification {
  emailVerificationRequired: true;
}

function RegisterGoogleButton({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations("auth.register");
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  // Nothing on this path may be written to the console — the Google token and the AuthResponse
  // both carry live credentials. Same rule as the login page.
  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res = await apiClient.post<AuthResponse>(API.auth.googleLogin, {
          idToken: tokenResponse.access_token,
        });
        const { user, accessToken, expiresAt } = res.data;

        login(user, accessToken);
        setAccessTokenCookie(accessToken, expiresAt);
        toast.success(t("toasts.googleSignInSuccess"));
        router.replace(callbackUrl);
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } } };
        toast.error(error?.response?.data?.error || t("toasts.googleSignInFailed"));
      }
    },
    onError: () => toast.error(t("toasts.googleAuthFailed")),
  });

  return (
    <button
      type="button"
      onClick={() => handleGoogleLogin()}
      className="flex h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-neutral-300 bg-white text-[15px] font-medium text-black transition-colors hover:bg-neutral-50"
    >
      <GoogleAuthIcon className="size-5" />
      {t("continueWithGoogle")}
    </button>
  );
}

function RegisterGoogleUnavailableButton() {
  const t = useTranslations("auth.register");
  return (
    <button
      type="button"
      disabled
      title={t("googleUnavailableHint")}
      className="flex h-14 w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-neutral-200 bg-neutral-50 text-[15px] font-medium text-neutral-400"
    >
      <GoogleAuthIcon className="size-5" />
      {t("continueWithGoogle")}
    </button>
  );
}

function RegisterForm() {
  const t = useTranslations("auth.register");
  const tv = useTranslations("validation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const hasToken = Boolean(token);
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl") || searchParams.get("redirect"));

  const login = useAuthStore((s) => s.login);
  const [showPassword, setShowPassword] = useState(false);
  // An invitation is proof of the address, so there is no email to ask for.
  const [step, setStep] = useState<Step>(hasToken ? "details" : "email");

  const registerSchema = useMemo(() => getRegisterSchema(hasToken, tv), [hasToken, tv]);
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema) as Resolver<RegisterFormData>,
  });

  // Plain state, not form fields. These two always hold a valid answer — the step opens
  // pre-filled with the server's own defaults — so there is nothing for a resolver to validate,
  // and react-hook-form's `watch` is the one part of its API that cannot be read safely from a
  // memo. Two <select>s do not need a form library.
  const [speakLanguage, setSpeakLanguage] = useState(DEFAULT_SPEAK);
  const [listenLanguage, setListenLanguage] = useState(DEFAULT_LISTEN);

  const steps = useMemo<Step[]>(
    () => (hasToken ? ["details", "languages"] : ["email", "details", "languages"]),
    [hasToken],
  );
  const stepIndex = steps.indexOf(step);

  async function goForward() {
    if (step === "email") {
      if (await trigger("email")) setStep("details");
      return;
    }
    if (step === "details") {
      const ok = await trigger(["fullName", "password"]);
      if (ok) setStep("languages");
      return;
    }
  }

  function goBack() {
    const previous = steps[stepIndex - 1];
    if (previous) setStep(previous);
  }

  // WT-456: only ever reached on the LAST step. The earlier steps are intercepted in the form's
  // onSubmit below and never get here.
  //
  // This used to open with `if (step !== "languages") { await goForward(); return; }`, which read
  // as the step-advance path and was in fact unreachable on step 1. `handleSubmit` validates the
  // WHOLE resolver schema before it calls this function, and the schema requires `fullName` and
  // `password` — fields that belong to step 2 and are still empty while the user is on step 1. So
  // pressing Continue failed validation, this function was never invoked, goForward() never ran,
  // and the errors were attached to two fields that step 1 does not render. The button did
  // nothing and said nothing.
  //
  // Step 2 -> 3 worked, which is why the bug looked intermittent: by then all three fields hold
  // values, so the full-schema check passes and the old guard did run.
  const onSubmit = async (data: RegisterFormData) => {
    try {
      const profile = {
        password: data.password,
        fullName: data.fullName.trim(),
        defaultSpeakLanguage: speakLanguage,
        defaultListenLanguage: listenLanguage,
      };

      const res = hasToken
        ? await apiClient.post<AuthResponse>(API.auth.registerInvited, { token, ...profile })
        : await apiClient.post<AuthResponse | PendingVerification>(API.auth.register, {
            email: data.email,
            ...profile,
          });

      // BR-02 — a self-registered account has no session until its email is verified. The invited
      // path is deliberately different: an invitation that arrived at the address IS the proof of
      // the address, so it signs in directly.
      if ("emailVerificationRequired" in res.data && res.data.emailVerificationRequired) {
        toast.success(t("toasts.accountCreatedCheckEmail"));
        // The address is not put in the query string: it is personal data, and a URL is the one
        // place every proxy on the way would log it.
        router.replace("/verify-email");
        return;
      }

      const { user, accessToken, expiresAt } = res.data as AuthResponse;
      login(user, accessToken);
      setAccessTokenCookie(accessToken, expiresAt);
      toast.success(t("toasts.registrationSuccess"));
      router.replace(callbackUrl);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || t("toasts.registrationFailed"));
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-white font-sans text-black">
      <AnimatedHalftone />

      <div className="absolute left-6 top-6 z-30">
        <Link href="/" className="inline-block transition-opacity hover:opacity-80">
          <Image
            src="/assets/logos/warptalk-sidebar-logo.png"
            alt="WarpTalk"
            width={100}
            height={24}
            className="h-6 w-auto object-contain mix-blend-multiply"
            priority
          />
        </Link>
      </div>

      <div className="absolute right-6 top-6 z-30">
        <LanguageSwitcher />
      </div>

      <div className="relative z-20 w-full max-w-[360px] px-4">
        <div className="mb-8 flex flex-col items-center">
          <h1 className="mb-2 text-center text-3xl font-semibold tracking-tight text-black">
            {t("heading")}
          </h1>
          {/* Three segments, not "Step 2 of 3" — the shape of the progress is the message, and it
              stays out of the way of the question being asked. */}
          <div className="mt-3 flex w-full items-center gap-1.5">
            {steps.map((name, index) => (
              <span
                key={name}
                className={cn(
                  "h-[3px] flex-1 rounded-full transition-colors",
                  index <= stepIndex ? "bg-black" : "bg-neutral-200",
                )}
              />
            ))}
          </div>
        </div>

        {/*
          WT-456: the earlier steps must NOT go through handleSubmit.

          One <form> spans all three panels and every Continue is a submit button, so a press on
          step 1 ran handleSubmit, which validates the entire schema — including the step-2 fields
          the user has not reached yet. Validation failed, onSubmit was never called, and the
          resulting errors belonged to inputs step 1 does not render: a dead button with no
          message, which is exactly how the bug was reported.

          goForward() validates only the fields of the step being left (`trigger("email")`,
          `trigger(["fullName","password"])`), so each error lands on an input the user can
          actually see. Enter and the button take the same path, because both raise submit.
        */}
        <form
          onSubmit={(event) => {
            if (step !== "languages") {
              event.preventDefault();
              void goForward();
              return;
            }
            void handleSubmit(onSubmit)(event);
          }}
          className="w-full"
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
                  <RegisterGoogleButton callbackUrl={callbackUrl} />
                ) : (
                  <RegisterGoogleUnavailableButton />
                )}

                <div className="flex items-center gap-4 py-2">
                  <div className="h-[1px] flex-1 bg-neutral-200" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                    {t("or")}
                  </span>
                  <div className="h-[1px] flex-1 bg-neutral-200" />
                </div>

                <div className="space-y-2">
                  <input
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder={t("emailPlaceholder")}
                    className={inputClass(Boolean(errors.email))}
                    {...register("email")}
                  />
                  <FieldError message={errors.email?.message} />
                </div>

                <PrimaryButton>{t("continue")}</PrimaryButton>
              </motion.div>
            ) : step === "details" ? (
              <motion.div
                key="details-step"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {hasToken ? null : <EmailSummary email={getValues("email") ?? ""} onEdit={() => setStep("email")} />}

                <div className="space-y-2">
                  {/* One name field, not first + last. The product shows a full name everywhere —
                      the roster, the transcript, the summary — and the two fields were only ever
                      concatenated back together before being sent. */}
                  <input
                    type="text"
                    autoComplete="name"
                    autoFocus
                    placeholder={t("fullNamePlaceholder")}
                    className={inputClass(Boolean(errors.fullName))}
                    {...register("fullName")}
                  />
                  <FieldError message={errors.fullName?.message} />
                </div>

                <div className="space-y-2">
                  <div className="relative block">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={t("passwordPlaceholder")}
                      className={cn(inputClass(Boolean(errors.password)), "pr-12")}
                      {...register("password")}
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors hover:text-black"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                    >
                      {showPassword ? <EyeClosed weight="regular" size={20} /> : <Eye weight="regular" size={20} />}
                    </button>
                  </div>
                  <FieldError message={errors.password?.message} />
                  {errors.password ? null : (
                    <p className="px-1 text-[13px] text-neutral-500">{t("passwordHint")}</p>
                  )}
                </div>

                <PrimaryButton>{t("continue")}</PrimaryButton>
                {stepIndex > 0 ? <BackButton onClick={goBack} label={t("back")} /> : null}
              </motion.div>
            ) : (
              <motion.div
                key="languages-step"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <p className="px-1 text-[13px] leading-5 text-neutral-600">
                  {t("languagesIntro")}
                </p>

                <LanguageField
                  id="speak-language"
                  label={t("speakLabel")}
                  value={speakLanguage}
                  onChange={setSpeakLanguage}
                />
                <LanguageField
                  id="listen-language"
                  label={t("listenLabel")}
                  value={listenLanguage}
                  onChange={setListenLanguage}
                />

                <PrimaryButton disabled={isSubmitting}>
                  {isSubmitting ? <Spinner weight="bold" className="animate-spin" /> : t("createAccount")}
                </PrimaryButton>
                <BackButton onClick={goBack} label={t("back")} />
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        <p className="relative z-20 mt-6 text-center text-[13px] font-medium text-neutral-700">
          <span className="rounded-lg bg-white/70 px-2 py-1 backdrop-blur-md">
            {t("alreadyHaveAccount")}{" "}
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="text-black hover:underline"
            >
              {t("logIn")}
            </Link>
          </span>
        </p>

        <div className="relative z-20 mt-auto flex justify-center pb-6 pt-12">
          <div className="flex items-center gap-4 rounded-full border border-white/50 bg-white/70 px-4 py-1.5 text-[13px] font-medium text-neutral-700 shadow-sm backdrop-blur-md">
            <Link href="/terms" className="transition-colors hover:text-black hover:underline">
              {t("termsOfUse")}
            </Link>
            <span className="text-neutral-400">|</span>
            <Link href="/privacy" className="transition-colors hover:text-black hover:underline">
              {t("privacyPolicy")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The login page's input, to the pixel. Kept in one place so the two cannot drift. */
function inputClass(hasError: boolean) {
  return cn(
    "h-14 w-full rounded-full border border-neutral-300 bg-white px-5 text-[15px] text-black outline-none transition-all placeholder:text-neutral-500 focus:border-black focus:ring-1 focus:ring-black",
    hasError && "border-[#d92d20] focus:border-[#d92d20] focus:ring-[#d92d20]",
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[#d92d20]">
      <WarningCircle size={16} />
      <p className="text-[13px] font-medium">{message}</p>
    </div>
  );
}

function PrimaryButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="flex h-14 w-full items-center justify-center rounded-full bg-black text-[15px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70"
    >
      {children}
    </button>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-full items-center justify-center gap-1 rounded-full text-[13px] font-medium text-neutral-600 transition-colors hover:text-black"
    >
      <CaretLeft size={13} weight="bold" />
      {label}
    </button>
  );
}

/** The answered email, with a way back to it — the login page's own pattern. */
function EmailSummary({ email, onEdit }: { email: string; onEdit: () => void }) {
  const t = useTranslations("auth.register");
  return (
    <div className="relative mb-4 flex h-14 w-full items-center justify-between rounded-full border border-neutral-300 bg-white px-5">
      <label className="absolute -top-2 left-4 bg-white px-1 text-[12px] font-normal text-neutral-500">
        {t("emailLabel")}
      </label>
      <span className="truncate pr-4 text-[15px] text-black">{email}</span>
      <button
        type="button"
        onClick={onEdit}
        className="whitespace-nowrap text-[15px] font-normal text-[#2563eb] hover:underline"
      >
        {t("edit")}
      </button>
    </div>
  );
}

/**
 * A native select inside the pill, rather than the app's own Select.
 *
 * The auth pages have no design-system provider mounted and deliberately keep their own visual
 * language; a native select also gets the platform's own picker on mobile, which is the right
 * control for a list of forty languages on a phone at sign-up.
 */
function LanguageField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="absolute -top-2 left-4 z-10 bg-white px-1 text-[12px] font-normal text-neutral-500"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full appearance-none rounded-full border border-neutral-300 bg-white px-5 text-[15px] text-black outline-none transition-all focus:border-black focus:ring-1 focus:ring-black"
      >
        {MEETING_LANGUAGES.map((language) => (
          <option key={language.locale} value={language.locale}>
            {language.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-20 grid place-items-center bg-white">
          <Spinner weight="bold" className="animate-spin text-black" size={32} />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
