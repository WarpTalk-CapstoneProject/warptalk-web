"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, Loader2, MessageSquareText, Send, Star } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  useSubmitTranslationRoomFeedback,
  useTranslationRoom,
  useTranslationRoomFeedbackState,
} from "@/hooks/use-translationRooms";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { SubmitTranslationRoomFeedbackRequest, TranslationRoomStatus } from "@/types/translationRoom";

type RatingField = {
  key: keyof Omit<SubmitTranslationRoomFeedbackRequest, "comments">;
  label: string;
  helper: string;
  required?: boolean;
};

const ratingFields: RatingField[] = [
  {
    key: "overallRating",
    label: "Overall rating",
    helper: "Your overall room experience.",
    required: true,
  },
  {
    key: "translationQuality",
    label: "Translation quality",
    helper: "Accuracy, timing, and wording.",
  },
  {
    key: "audioQuality",
    label: "Audio quality",
    helper: "Clarity, delay, and stability.",
  },
  {
    key: "voiceCloneQuality",
    label: "Voice clone quality",
    helper: "Naturalness and speaker match.",
  },
  {
    key: "aiSummaryQuality",
    label: "AI summary quality",
    helper: "Only rate this if a summary was generated.",
  },
];

const pageCopy = {
  title: "Post-room feedback",
  subtitle: "A one-time quality form shown after a translation room has ended.",
};

function normalizeFeedbackRoomStatus(status?: string): TranslationRoomStatus {
  if (status === "active" || status === "live") return "in_progress";
  if (status === "completed") return "ended";
  if (
    status === "scheduled" ||
    status === "waiting" ||
    status === "in_progress" ||
    status === "ended" ||
    status === "archived" ||
    status === "cancelled"
  ) {
    return status;
  }

  return "scheduled";
}

function isFeedbackAvailable(status: TranslationRoomStatus) {
  return status === "ended" || status === "archived";
}

function RatingButtons({
  value,
  onChange,
  disabled,
}: {
  value?: number;
  onChange: (value?: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5].map((rating) => {
        const selected = value === rating;

        return (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(selected ? undefined : rating)}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50",
              selected
                ? "border-[#003476] bg-[#003476] text-white shadow-sm"
                : "border-[#e4eef9] bg-white text-black hover:bg-[#fdfcf6] hover:text-[#003476]"
            )}
          >
            {rating}
          </button>
        );
      })}
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<FeedbackLoading />}>
      <FeedbackContent />
    </Suspense>
  );
}

function FeedbackContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId")?.trim() ?? "";
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? "mock-preview-user";
  const { data: room, isLoading: isRoomLoading, isError: isRoomError } = useTranslationRoom(roomId);
  const feedbackState = useTranslationRoomFeedbackState(roomId, userId);
  const submitFeedback = useSubmitTranslationRoomFeedback(roomId, userId);
  const [form, setForm] = useState<SubmitTranslationRoomFeedbackRequest>({
    overallRating: 0,
    translationQuality: undefined,
    audioQuality: undefined,
    voiceCloneQuality: undefined,
    aiSummaryQuality: undefined,
    comments: "",
  });
  const [submittedFeedbackId, setSubmittedFeedbackId] = useState<string | null>(null);

  const roomStatus = normalizeFeedbackRoomStatus(room?.status);
  const canSubmit = Boolean(roomId && room && isFeedbackAvailable(roomStatus) && !feedbackState.data?.hasSubmitted);
  const hasSubmitted = Boolean(feedbackState.data?.hasSubmitted || submittedFeedbackId);

  const scoreSummary = useMemo(() => {
    const values = ratingFields
      .map((field) => form[field.key])
      .filter((value): value is number => typeof value === "number" && value > 0);
    if (values.length === 0) return "No score selected";

    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return `${average.toFixed(1)} average across ${values.length} score${values.length === 1 ? "" : "s"}`;
  }, [form]);

  const updateRating = (key: RatingField["key"], value?: number) => {
    setForm((current) => ({
      ...current,
      [key]: value ?? (key === "overallRating" ? 0 : undefined),
    }));
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("Feedback is only available after a room has ended.");
      return;
    }

    if (!form.overallRating) {
      toast.error("Select an overall rating before submitting.");
      return;
    }

    try {
      const feedback = await submitFeedback.mutateAsync({
        ...form,
        comments: form.comments?.trim() || undefined,
      });
      setSubmittedFeedbackId(feedback.id);
      toast.success("Feedback submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit feedback.";
      toast.error(message);
    }
  };

  if (!roomId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{pageCopy.title}</h1>
          <p className="text-muted-foreground">{pageCopy.subtitle}</p>
        </div>

        <Card className="rounded-lg border-[#e4eef9]">
          <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-[#e4eef9] text-[#003476]">
              <MessageSquareText className="size-6" />
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-lg font-semibold">Choose an ended room first</h2>
              <p className="text-sm text-muted-foreground">
                WT-98 starts from a completed room, then opens this form for that room only.
              </p>
            </div>
            <Link
              href="/rooms"
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[#003476] px-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#003476]/90"
            >
              View rooms
            </Link>
            <Link
              href="/feedback?roomId=wt-98-feedback-demo"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-[#e4eef9] bg-white px-2.5 text-sm font-medium text-[#003476] shadow-sm transition-colors hover:bg-[#fdfcf6]"
            >
              Open post-room preview
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isRoomLoading || feedbackState.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{pageCopy.title}</h1>
          <p className="text-muted-foreground">Loading room status and submission state.</p>
        </div>
        <Card className="rounded-lg border-[#e4eef9]">
          <CardContent className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading feedback flow...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isRoomError || !room) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{pageCopy.title}</h1>
          <p className="text-muted-foreground">We could not load this room.</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Room unavailable</AlertTitle>
          <AlertDescription>
            Check that the room exists and that your account can access it before submitting feedback.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!isFeedbackAvailable(roomStatus)) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{pageCopy.title}</h1>
            <p className="text-muted-foreground">{room.title}</p>
          </div>
          <Badge variant="outline" className="border-[#e4eef9] bg-[#fdfcf6] text-[#003476] capitalize">
            {roomStatus.replace("_", " ")}
          </Badge>
        </div>

        <Card className="rounded-lg border-[#e4eef9]">
          <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="size-8 text-[#003476]" />
            <h2 className="text-lg font-semibold">Feedback is locked for this room state</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Feedback opens only after the room reaches an ended or archived state. Current state is {roomStatus.replace("_", " ")}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{pageCopy.title}</h1>
          <p className="text-muted-foreground">
            Submit quality feedback for the ended room: <span className="font-medium text-foreground">{room.title}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-[#e4eef9] bg-[#fdfcf6] text-[#003476]">
            {room.translationRoomCode}
          </Badge>
          <Badge variant="outline" className="border-slate-200 bg-white text-slate-700 capitalize">
            {roomStatus}
          </Badge>
        </div>
      </div>

      {hasSubmitted ? (
        <Alert className="border-[#e4eef9] bg-[#fdfcf6] text-[#003476]">
          <CheckCircle2 />
          <AlertTitle>Feedback already submitted</AlertTitle>
          <AlertDescription>
            Duplicate submission is disabled for this room. Thanks for closing the loop.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-[#e4eef9] bg-[#fdfcf6]">
          <Star className="text-[#003476]" />
          <AlertTitle>After-session quality check</AlertTitle>
          <AlertDescription>
            This is the participant/host submission step after a meeting ends. Feedback management and analytics are outside WT-98.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-lg border-[#e4eef9]">
          <CardHeader>
            <CardTitle className="text-lg">One-time feedback form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {ratingFields.map((field) => (
              <div key={field.key} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{field.label}</p>
                    {field.required && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        Required
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{field.helper}</p>
                </div>
                <RatingButtons
                  value={form[field.key]}
                  disabled={hasSubmitted || submitFeedback.isPending}
                  onChange={(value) => updateRating(field.key, value)}
                />
              </div>
            ))}

            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="feedback-comments">
                Comments
              </label>
              <Textarea
                id="feedback-comments"
                value={form.comments}
                disabled={hasSubmitted || submitFeedback.isPending}
                onChange={(event) => setForm((current) => ({ ...current, comments: event.target.value }))}
                placeholder="What should the team improve for future translated rooms?"
                className="min-h-28 bg-white"
              />
            </div>

            {submitFeedback.isError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Submission failed</AlertTitle>
                <AlertDescription>
                  {submitFeedback.error instanceof Error ? submitFeedback.error.message : "Please try again."}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-sm text-muted-foreground">{scoreSummary}</p>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || hasSubmitted || submitFeedback.isPending}
                className="bg-[#003476] text-white hover:bg-[#003476]/90"
              >
                {submitFeedback.isPending && <Loader2 className="animate-spin" />}
                {submitFeedback.isPending ? "Submitting..." : hasSubmitted ? "Submitted" : "Submit feedback"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="rounded-lg border-[#e4eef9] bg-[#fdfcf6]">
            <CardHeader>
              <CardTitle className="text-base">WT-98 workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-[#003476]" />
                <div>
                  <p className="font-medium text-[#003476]">1. Room ends</p>
                  <p className="text-muted-foreground">Only ended or archived rooms open this form.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Send className="mt-0.5 size-4 shrink-0 text-[#003476]" />
                <div>
                  <p className="font-medium text-[#003476]">2. User submits once</p>
                  <p className="text-muted-foreground">Ratings map to translation_room_feedback and duplicate submit is disabled.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#003476]" />
                <div>
                  <p className="font-medium text-[#003476]">3. Stored for later review</p>
                  <p className="text-muted-foreground">Admin feedback lists or analytics should be a separate dashboard ticket.</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-lg border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="text-base">Backend contract</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Current UI uses a typed mock adapter because GET/POST feedback endpoints are not implemented yet.</p>
              <p>Real backend should enforce ended/archived state and unique room/user submission.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function FeedbackLoading() {
  return (
    <Card className="rounded-lg border-[#e4eef9]">
      <CardContent className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading feedback flow...
      </CardContent>
    </Card>
  );
}
