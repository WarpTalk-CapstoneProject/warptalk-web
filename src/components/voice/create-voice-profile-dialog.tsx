"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Microphone, Pause, Play, Stop } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { LanguageLabel, languageLabelText } from "@/components/language/language-label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateVoiceProfile } from "@/hooks/use-voice-profiles";
import { claimPlayback, type PlaybackClaim } from "@/lib/audio/exclusive-playback";
import { getErrorMessage } from "@/lib/api/errors";
import { languagesInScope, type SupportedLanguage } from "@/lib/language/languages";
import { resolveProfileLanguage } from "@/lib/voice/library-languages";
import { analyzeVoiceSample } from "@/lib/voice/voice-sample-quality";

const ALL_PROFILE_LANGUAGES = languagesInScope("voiceProfile");

const MAX_SAMPLE_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * The five confirmations, WORD FOR WORD as the server hashes them.
 *
 * VoiceProfileConsentContract.CanonicalContractText is the authority: the server SHA-256s that
 * exact string, stores the digest in the profile's consent version, and that digest is the only
 * evidence of what was agreed to. Showing different words here and storing that hash means the
 * record claims somebody agreed to a sentence they were never shown. The first item used to read
 * "I confirm this is my own voice sample." and did exactly that.
 *
 * Change a sentence here only together with the constant on the server.
 *
 * NOT ROUTED THROUGH i18n, DELIBERATELY. Translating these labels would mean the record of what
 * a person agreed to no longer matches the hash the server verifies against — see the file
 * header. These five strings stay English-only regardless of the UI locale; only the chrome
 * around them (the dialog title, buttons, other fields) is translated.
 */
const CONSENT_ITEMS = [
  { key: "ownVoiceConfirmed", label: "This is my own voice." },
  {
    key: "aiUseConfirmed",
    label: "I allow WarpTalk to use this voice profile for AI speech translation.",
  },
  {
    key: "syntheticVoiceAcknowledged",
    label: "I understand generated speech may sound like me in supported languages.",
  },
  {
    key: "noImpersonationConfirmed",
    label: "I will not use this voice profile to impersonate, deceive, or mislead others.",
  },
  {
    key: "retentionAcknowledged",
    label: "I understand I can delete or revoke this voice profile later.",
  },
] as const;

type ConsentKey = (typeof CONSENT_ITEMS)[number]["key"];

const EMPTY_CONSENT: Record<ConsentKey, boolean> = {
  ownVoiceConfirmed: false,
  aiUseConfirmed: false,
  syntheticVoiceAcknowledged: false,
  noImpersonationConfirmed: false,
  retentionAcknowledged: false,
};

/**
 * Record or upload one sample and turn it into a voice.
 *
 * WHY THE CONSENT HERE IS NOT THE CONSENT ON THE PAGE BEHIND IT
 *     These five confirmations are the VOICE_PROFILE_UPLOAD consent, and they are about THIS
 *     recording: that the voice is yours, and that WarpTalk may build a model from the file you
 *     are handing over. The rail behind this dialog carries a different permission — whether a
 *     MEETING may clone you from your live speech — which nothing here needs and which is not
 *     granted by finishing this form. Saying so under the heading is the whole fix for a page
 *     that looked like it asked the same question twice.
 */
export function CreateVoiceProfileDialog({
  open,
  onOpenChange,
  defaultLanguage = "vi-VN",
  languages = ALL_PROFILE_LANGUAGES,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLanguage?: string;
  /**
   * The languages a sample may be recorded in — narrowed by the workspace's policy, see
   * voice/library-languages.ts `voiceProfileLanguages`.
   */
  languages?: readonly SupportedLanguage[];
}) {
  const t = useTranslations("voiceProfiles.createDialog");
  const createProfile = useCreateVoiceProfile();

  const [displayName, setDisplayName] = useState("");
  const [chosenLanguage, setLanguage] = useState(defaultLanguage);
  // Snapped at render, not in the setter: the policy and the page's language can both change
  // while this dialog stays mounted, and a stale choice must never be what gets submitted.
  const language = resolveProfileLanguage(chosenLanguage, languages);
  // Values are the locale tags the backend stores and must not change; the label is what a
  // person reads, and a raw tag in parentheses is not that.
  const languageOptions = languages.map((option) => ({
    value: option.locale,
    label: languageLabelText(option.locale),
  }));
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleAssessment, setSampleAssessment] = useState<string | null>(null);
  const [sampleAccepted, setSampleAccepted] = useState(false);
  const [consent, setConsent] = useState<Record<ConsentKey, boolean>>(EMPTY_CONSENT);
  const [isCheckingSample, setIsCheckingSample] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // WT-632 — the clip itself, playable, held separately from `sampleFile` on purpose: a sample
  // the quality check REFUSED is cleared from `sampleFile` but is exactly the one somebody needs
  // to hear. "Too quiet" is an assertion until you play it back and hear that it is.
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [isPlayingSample, setIsPlayingSample] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const sampleUrlRef = useRef<string | null>(null);
  const sampleClaimRef = useRef<PlaybackClaim | null>(null);

  const outstandingConsent = CONSENT_ITEMS.filter((item) => !consent[item.key]).length;
  const canSave =
    Boolean(displayName.trim()) &&
    Boolean(sampleFile) &&
    outstandingConsent === 0 &&
    !isCheckingSample &&
    !isRecording;

  useEffect(
    () => () => {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      sampleAudioRef.current?.pause();
      sampleClaimRef.current?.release();
      // An object URL is a live handle into the document, not a value. One is created per clip
      // and every re-record makes another, so leaving them behind pins every take in memory for
      // the life of the page.
      if (sampleUrlRef.current) URL.revokeObjectURL(sampleUrlRef.current);
    },
    [],
  );

  /** Point playback at a new clip, or at nothing, releasing whatever it held before. */
  function holdForPlayback(file: File | null) {
    sampleAudioRef.current?.pause();
    sampleClaimRef.current?.release();
    sampleAudioRef.current = null;
    setIsPlayingSample(false);
    if (sampleUrlRef.current) {
      URL.revokeObjectURL(sampleUrlRef.current);
      sampleUrlRef.current = null;
    }
    const url = file ? URL.createObjectURL(file) : null;
    sampleUrlRef.current = url;
    setSampleUrl(url);
  }

  function playSample() {
    if (!sampleUrl) return;
    if (isPlayingSample) {
      sampleAudioRef.current?.pause();
      sampleClaimRef.current?.release();
      setIsPlayingSample(false);
      return;
    }

    // The page's one playback slot: a library preview still playing behind this dialog stops, and
    // pressing play on anything else stops this take. See lib/audio/exclusive-playback.
    sampleAudioRef.current?.pause();
    const claim = claimPlayback(() => {
      sampleAudioRef.current?.pause();
      setIsPlayingSample(false);
    });
    sampleClaimRef.current = claim;

    // A fresh element each press rather than a resumed one: the take is a few seconds long, and
    // starting from wherever a previous stop landed is not what "play it back" means here.
    const audio = new Audio(sampleUrl);
    audio.onended = () => {
      claim.release();
      setIsPlayingSample(false);
    };
    audio.onerror = () => {
      claim.release();
      setIsPlayingSample(false);
      toast.error("That recording could not be played back in this browser.");
    };
    sampleAudioRef.current = audio;
    void audio
      .play()
      .then(() => {
        if (claim.isCurrent()) setIsPlayingSample(true);
        else audio.pause();
      })
      .catch(() => {
        if (!claim.isCurrent()) return;
        claim.release();
        setIsPlayingSample(false);
        toast.error("That recording could not be played back in this browser.");
      });
  }

  function resetForm() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    setIsRecording(false);
    setDisplayName("");
    setLanguage(defaultLanguage);
    setSampleFile(null);
    setSampleAssessment(null);
    setSampleAccepted(false);
    setConsent(EMPTY_CONSENT);
    holdForPlayback(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function checkAndSetSample(file: File | null): Promise<boolean> {
    if (!file) {
      setSampleFile(null);
      setSampleAssessment(null);
      setSampleAccepted(false);
      holdForPlayback(null);
      return false;
    }
    if (file.size > MAX_SAMPLE_SIZE_BYTES) {
      toast.error(t("toasts.sampleTooLarge"));
      setSampleFile(null);
      setSampleAssessment(null);
      setSampleAccepted(false);
      holdForPlayback(null);
      return false;
    }

    // Held before the check, not after it: the check is asynchronous and its verdict is about
    // this clip, so the clip has to be playable while the verdict is still being formed and
    // afterwards whichever way it goes.
    holdForPlayback(file);

    setIsCheckingSample(true);
    const assessment = await analyzeVoiceSample(file);
    setIsCheckingSample(false);
    setSampleAssessment(assessment.message);
    setSampleAccepted(assessment.accepted);
    if (!assessment.accepted) {
      setSampleFile(null);
      toast.error(assessment.message);
      return false;
    }

    setSampleFile(file);
    return true;
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const accepted = await checkAndSetSample(file);
    if (!accepted) event.target.value = "";
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error(t("toasts.recordingUnsupported"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const preferredType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("ogg") ? "ogg" : "webm";
        const recording = new File(recordingChunksRef.current, `voice-sample.${extension}`, {
          type: mimeType,
        });
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        void checkAndSetSample(recording);
      };
      recorder.start(250);
      setIsRecording(true);
      setSampleAccepted(false);
      setSampleAssessment(t("recordingHint"));
    } catch {
      toast.error(t("toasts.micDenied"));
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!displayName.trim()) {
      toast.error(t("toasts.nameRequired"));
      return;
    }
    if (!sampleFile) {
      toast.error(t("toasts.sampleRequired"));
      return;
    }
    if (outstandingConsent > 0) {
      toast.error(t("toasts.consentRequired"));
      return;
    }

    try {
      await createProfile.mutateAsync({
        displayName: displayName.trim(),
        language,
        sample: sampleFile,
        ...consent,
      });
      toast.success(t("toasts.created"));
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error, t("toasts.createFailed")));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="hide-scrollbar flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 border-b border-border py-3">
            <Label htmlFor="displayName" className="text-[12.5px] font-normal text-ink-muted">
              {t("nameLabel")}
            </Label>
            <Input
              id="displayName"
              className="h-8 text-[12.5px]"
              placeholder={t("namePlaceholder")}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 border-b border-border py-3">
            <Label className="text-[12.5px] font-normal text-ink-muted">{t("languageLabel")}</Label>
            <Select value={language} onValueChange={(value) => setLanguage(value || defaultLanguage)}>
              <SelectTrigger className="h-8 w-full text-[12.5px]">
                <SelectValue>
                  {(value) => (value ? <LanguageLabel value={String(value)} /> : t("selectLanguage"))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 border-b border-border py-3">
            <Label htmlFor="sample" className="pt-1.5 text-[12.5px] font-normal text-ink-muted">
              {t("sampleLabel")}
            </Label>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "outline"}
                  size="sm"
                  className="h-8 flex-1 text-[12.5px]"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isCheckingSample}
                >
                  {isRecording ? <Stop size={13} weight="fill" /> : <Microphone size={13} />}
                  {isRecording ? t("stop") : t("record")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-[12.5px]"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCheckingSample || isRecording}
                >
                  {t("uploadFile")}
                </Button>
                {/*
                  WT-632 — hearing what was just recorded, before it is sent anywhere.
                  Nothing on this page could do that: the only play button lived on the row
                  BEHIND this dialog and renders the CLONE, which does not exist until the
                  profile has been saved and the AI side has finished with it. So the one moment
                  where hearing the take is worth anything — while it can still be re-recorded —
                  was the one moment it could not be heard.

                  This plays the local file. No request, no synthesis, no waiting.
                */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 shrink-0 p-0"
                  onClick={playSample}
                  disabled={!sampleUrl || isRecording}
                  aria-label={isPlayingSample ? "Stop the sample" : "Play the sample back"}
                >
                  {isPlayingSample ? (
                    <Pause size={13} weight="fill" />
                  ) : (
                    <Play size={13} weight="fill" />
                  )}
                </Button>
              </div>
              <input
                id="sample"
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="sr-only"
                onChange={handleFileChange}
              />
              <p className="text-[11px] leading-[1.55] text-ink-subtle">
                {t("sampleInstructions")}
              </p>
              {sampleAssessment ? (
                <p
                  className={
                    sampleAccepted && sampleFile
                      ? "flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400"
                      : "text-[11px] text-ink-muted"
                  }
                >
                  {sampleAccepted && sampleFile ? <CheckCircle size={12} weight="fill" /> : null}
                  {sampleFile ? `${sampleFile.name} · ` : ""}
                  {sampleAssessment}
                </p>
              ) : null}
            </div>
          </div>

          <div className="border-b border-border py-2">
            <p className="pb-1 text-[11px] leading-[1.55] text-ink-subtle">
              {t("consentIntro")}
            </p>
            {CONSENT_ITEMS.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-2.5 py-1.5 text-[12px] leading-[1.5] text-ink-muted"
              >
                <Checkbox
                  className="mt-0.5 shrink-0"
                  checked={consent[item.key]}
                  onCheckedChange={(checked) =>
                    setConsent((current) => ({ ...current, [item.key]: checked === true }))
                  }
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>

          <DialogFooter className="items-center justify-between gap-3 pt-4 sm:justify-between">
            <span className="text-[11px] text-ink-subtle">
              {outstandingConsent === 0
                ? t("allFiveConfirmed")
                : t("leftToConfirm", { count: outstandingConsent })}
            </span>
            <Button
              type="submit"
              size="sm"
              className="h-8 text-[12.5px]"
              disabled={createProfile.isPending || !canSave}
            >
              {createProfile.isPending ? t("saving") : t("agreeAndSave")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
