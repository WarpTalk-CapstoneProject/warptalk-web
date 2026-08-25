"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Microphone, Stop } from "@phosphor-icons/react";
import { toast } from "sonner";

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
import { getErrorMessage } from "@/lib/api/errors";
import { languagesInScope } from "@/lib/language/languages";
import { analyzeVoiceSample } from "@/lib/voice/voice-sample-quality";

// Values are the locale tags the backend stores and must not change; the label is what a
// person reads, and a raw tag in parentheses is not that.
const LANGUAGE_OPTIONS = languagesInScope("voiceProfile").map((language) => ({
  value: language.locale,
  label: languageLabelText(language.locale),
}));

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
    label: "I understand I can delete this voice profile later.",
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLanguage?: string;
}) {
  const createProfile = useCreateVoiceProfile();

  const [displayName, setDisplayName] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleAssessment, setSampleAssessment] = useState<string | null>(null);
  const [sampleAccepted, setSampleAccepted] = useState(false);
  const [consent, setConsent] = useState<Record<ConsentKey, boolean>>(EMPTY_CONSENT);
  const [isCheckingSample, setIsCheckingSample] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

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
    },
    [],
  );

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
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function checkAndSetSample(file: File | null): Promise<boolean> {
    if (!file) {
      setSampleFile(null);
      setSampleAssessment(null);
      setSampleAccepted(false);
      return false;
    }
    if (file.size > MAX_SAMPLE_SIZE_BYTES) {
      toast.error("Audio sample must be under 20 MB.");
      setSampleFile(null);
      setSampleAssessment(null);
      setSampleAccepted(false);
      return false;
    }

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
      toast.error("This browser does not support direct audio recording.");
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
      setSampleAssessment("Recording… read the sentence below in a quiet room.");
    } catch {
      toast.error("Microphone access was denied or unavailable.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!displayName.trim()) {
      toast.error("Give the profile a name.");
      return;
    }
    if (!sampleFile) {
      toast.error("Record or upload a clear voice sample first.");
      return;
    }
    if (outstandingConsent > 0) {
      toast.error("Confirm all five statements to continue.");
      return;
    }

    try {
      await createProfile.mutateAsync({
        displayName: displayName.trim(),
        language,
        sample: sampleFile,
        ...consent,
      });
      toast.success("Voice profile saved. Cloning it now — usually under a minute.");
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create voice profile"));
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
          <DialogTitle>Set up voice profile</DialogTitle>
          <DialogDescription>
            Name it, pick the language it speaks, and give one clear sample of you talking.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 border-b border-border py-3">
            <Label htmlFor="displayName" className="text-[12.5px] font-normal text-ink-muted">
              Name
            </Label>
            <Input
              id="displayName"
              className="h-8 text-[12.5px]"
              placeholder="My presenting voice"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 border-b border-border py-3">
            <Label className="text-[12.5px] font-normal text-ink-muted">Language</Label>
            <Select value={language} onValueChange={(value) => setLanguage(value || defaultLanguage)}>
              <SelectTrigger className="h-8 w-full text-[12.5px]">
                <SelectValue>
                  {(value) => (value ? <LanguageLabel value={String(value)} /> : "Select language…")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 border-b border-border py-3">
            <Label htmlFor="sample" className="pt-1.5 text-[12.5px] font-normal text-ink-muted">
              Sample
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
                  {isRecording ? "Stop" : "Record"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-[12.5px]"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCheckingSample || isRecording}
                >
                  Upload a file
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
                Read this in your normal voice: &ldquo;WarpTalk helps my team understand every
                conversation clearly.&rdquo; One speaker, quiet room, 5&ndash;120 seconds, up to
                20&nbsp;MB.
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
            <p className="text-[12.5px] font-medium text-ink">Voice consent agreement</p>
            <p className="pb-1 text-[11px] leading-[1.55] text-ink-subtle">
              Consent for this recording. Separate from allowing a meeting to clone you live,
              which stays off unless you switch it on yourself.
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
                ? "All five confirmed."
                : `Complete consent to continue. ${outstandingConsent} of 5 left to confirm.`}
            </span>
            <Button
              type="submit"
              size="sm"
              className="h-8 text-[12.5px]"
              disabled={createProfile.isPending || !canSave}
            >
              {createProfile.isPending ? "Saving…" : "Agree & save voice profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
