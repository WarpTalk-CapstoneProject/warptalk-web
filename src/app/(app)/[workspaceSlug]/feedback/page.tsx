"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PaperPlaneRight, Spinner } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import {
  useSubmitTranslationRoomFeedback,
  useTranslationRoomFeedbackState,
} from "@/hooks/use-translationRooms";

const ratingFields = [
  { key: "overall", label: "Overall experience", helper: "Room flow, reliability, and comfort." },
  { key: "translation", label: "Translation quality", helper: "Accuracy, timing, and wording." },
  { key: "audio", label: "Audio clarity", helper: "Delay, stability, and speaker separation." },
  { key: "summary", label: "AI summary", helper: "Usefulness of notes and action items." },
] as const;

type RatingKey = (typeof ratingFields)[number]["key"];

export default function FeedbackPage() {
  return (
    <Suspense fallback={<FeedbackLoading />}>
      <FeedbackForm />
    </Suspense>
  );
}

function FeedbackForm() {
  const roomId = useSearchParams().get("roomId")?.trim() ?? "";
  const feedbackState = useTranslationRoomFeedbackState(roomId);
  const submitFeedback = useSubmitTranslationRoomFeedback(roomId);
  const [ratings, setRatings] = useState<Record<RatingKey, number>>({
    overall: 0,
    translation: 0,
    audio: 0,
    summary: 0,
  });
  const [comments, setComments] = useState("");
  const existing = feedbackState.data?.feedback;
  const submitted = feedbackState.data?.hasSubmitted === true;
  const displayRatings = submitted && existing
    ? {
        overall: existing.overallRating,
        translation: existing.translationQuality ?? 0,
        audio: existing.audioQuality ?? 0,
        summary: existing.aiSummaryQuality ?? 0,
      }
    : ratings;

  const selectedRatings = Object.values(displayRatings).filter(Boolean);
  const averageScore = selectedRatings.length
    ? (selectedRatings.reduce((sum, score) => sum + score, 0) / selectedRatings.length).toFixed(1)
    : "0.0";

  function updateRating(key: RatingKey, value: number) {
    if (feedbackState.data?.hasSubmitted) return;
    setRatings((current) => ({ ...current, [key]: current[key] === value ? 0 : value }));
  }

  async function submit() {
    if (!roomId) {
      toast.error("Open feedback from a completed room.");
      return;
    }
    if (!ratings.overall) {
      toast.error("Select an overall score before submitting.");
      return;
    }

    try {
      await submitFeedback.mutateAsync({
        overallRating: ratings.overall,
        translationQuality: ratings.translation || undefined,
        audioQuality: ratings.audio || undefined,
        aiSummaryQuality: ratings.summary || undefined,
        comments: comments.trim() || undefined,
      });
      toast.success("Feedback submitted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not submit feedback."));
    }
  }

  if (!roomId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select a completed room</CardTitle>
          <CardDescription>Feedback requires a room ID from meeting history.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/history" className={cn(buttonVariants())}>View history</Link>
        </CardContent>
      </Card>
    );
  }

  if (feedbackState.isLoading) return <FeedbackLoading />;

  if (feedbackState.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Feedback unavailable</CardTitle>
          <CardDescription>{getErrorMessage(feedbackState.error, "Could not load feedback state.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => feedbackState.refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/history" className={cn(buttonVariants({ variant: "outline" }))}>View history</Link>
        <Button onClick={submit} disabled={submitted || submitFeedback.isPending}>
          {submitFeedback.isPending
            ? <Spinner weight="light" className="mr-2 h-4 w-4 animate-spin" />
            : <PaperPlaneRight weight="light" className="mr-2 h-4 w-4" />}
          {submitted ? "Feedback submitted" : "Submit feedback"}
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Room quality form</CardTitle>
              <CardDescription>Your response is stored once for this completed room.</CardDescription>
            </div>
            <Badge variant={submitted ? "default" : "secondary"}>{submitted ? "Submitted" : "Draft"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {ratingFields.map((field) => (
              <div key={field.key} className="rounded-lg border p-4">
                <div className="mb-3">
                  <Label className="text-sm font-semibold">{field.label}</Label>
                  <p className="text-sm text-muted-foreground">{field.helper}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      disabled={submitted}
                      aria-label={`${field.label}: ${score} out of 5`}
                      aria-pressed={displayRatings[field.key] === score}
                      onClick={() => updateRating(field.key, score)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                        displayRatings[field.key] === score
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:bg-muted"
                      )}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="feedback-comments">Notes</Label>
            <Textarea
              id="feedback-comments"
              value={submitted ? existing?.comments ?? "" : comments}
              disabled={submitted}
              onChange={(event) => setComments(event.target.value)}
              placeholder="Add translation quality notes, missed terms, or follow-up requests."
              className="min-h-32"
            />
          </div>
          <p className="text-sm text-muted-foreground">Current selected average: {averageScore}/5</p>
        </CardContent>
      </Card>
    </div>
  );
}

function FeedbackLoading() {
  return (
    <div className="flex min-h-48 items-center justify-center text-muted-foreground">
      <Spinner weight="light" className="mr-2 h-5 w-5 animate-spin" />
      Loading feedback
    </div>
  );
}
