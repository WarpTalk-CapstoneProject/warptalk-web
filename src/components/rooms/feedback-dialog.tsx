"use client";

/**
 * Rating a meeting, without leaving it.
 *
 * WHY THIS IS NOT A PAGE ANY MORE
 *   It was `/[workspaceSlug]/feedback?roomId=…` — a whole route, reached by a link out of the
 *   post-meeting page, whose entire content was four score rows and a note box. A route has to
 *   carry the meeting id in the query string, has to handle arriving without one (it had a
 *   dedicated empty state for exactly that), and takes the reader away from the thing they are
 *   rating so that the back button becomes part of the flow. Four questions do not need any of
 *   that. As a dialog the meeting is already in scope, the answer is given where it was asked
 *   for, and the empty state has nothing left to describe.
 *
 * ALREADY-SUBMITTED IS A STATE, NOT A REFUSAL
 *   Feedback is once per person per meeting. Rather than hide the form, it shows what was
 *   submitted, read-only — otherwise reopening it looks like the submission was lost.
 */

import { useState } from "react";
import { PaperPlaneRight, Spinner, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useSubmitTranslationRoomFeedback,
  useTranslationRoomFeedbackState,
} from "@/hooks/use-translationRooms";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const ratingFields = [
  { key: "overall", label: "Overall experience", helper: "Room flow, reliability, and comfort." },
  { key: "translation", label: "Translation quality", helper: "Accuracy, timing, and wording." },
  { key: "audio", label: "Audio clarity", helper: "Delay, stability, and speaker separation." },
  { key: "summary", label: "AI summary", helper: "Usefulness of notes and action items." },
] as const;

type RatingKey = (typeof ratingFields)[number]["key"];

export function FeedbackDialog({
  roomId,
  meetingTitle,
  open,
  onOpenChange,
}: {
  roomId: string;
  /** Shown under the title so it is obvious which meeting is being rated. */
  meetingTitle?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The query only runs while the dialog is open. As a page this was unavoidable work on
  // navigation; as a dialog it is work nobody asked for until they open it.
  const feedbackState = useTranslationRoomFeedbackState(open ? roomId : "");
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
  const displayRatings =
    submitted && existing
      ? {
          overall: existing.overallRating,
          translation: existing.translationQuality ?? 0,
          audio: existing.audioQuality ?? 0,
          summary: existing.aiSummaryQuality ?? 0,
        }
      : ratings;

  function updateRating(key: RatingKey, value: number) {
    if (submitted) return;
    // Clicking the selected score clears it — the only way back to "no answer" for a question
    // that was answered by mistake.
    setRatings((current) => ({ ...current, [key]: current[key] === value ? 0 : value }));
  }

  async function submit() {
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
      onOpenChange(false);
    } catch (error) {
      // Left open on purpose: a failed submit must not look like a completed one, and the
      // answers already given are still in the form.
      toast.error(getErrorMessage(error, "Could not submit feedback."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{submitted ? "Your feedback" : "Rate this meeting"}</DialogTitle>
          <DialogDescription>
            {meetingTitle
              ? meetingTitle
              : "Ratings are per meeting and are visible to the workspace admins."}
          </DialogDescription>
        </DialogHeader>

        {feedbackState.isLoading ? (
          <div className="flex min-h-40 items-center justify-center text-[13px] text-ink-muted">
            <Spinner weight="light" className="mr-2 h-4 w-4 animate-spin" />
            Loading feedback
          </div>
        ) : feedbackState.isError ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
            <WarningCircle className="h-5 w-5 text-ink-muted" />
            <p className="text-[13px] text-ink-muted">
              {getErrorMessage(feedbackState.error, "Could not load feedback state.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => feedbackState.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div>
            {/* One question per line, scores on the right where the eye already is. */}
            <div className="border-y border-hairline">
              {ratingFields.map((field) => (
                <div
                  key={field.key}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <Label className="text-[13px] font-medium text-ink">{field.label}</Label>
                    <p className="mt-0.5 text-[12px] text-ink-muted">{field.helper}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        disabled={submitted}
                        aria-label={`${field.label}: ${score} out of 5`}
                        aria-pressed={displayRatings[field.key] === score}
                        onClick={() => updateRating(field.key, score)}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md border text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                          displayRatings[field.key] === score
                            ? "border-transparent bg-foreground text-background"
                            : "border-border/60 bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <Label htmlFor="feedback-comments" className="text-[13px] font-medium text-ink">
                Notes
              </Label>
              <Textarea
                id="feedback-comments"
                value={submitted ? (existing?.comments ?? "") : comments}
                disabled={submitted}
                onChange={(event) => setComments(event.target.value)}
                placeholder="Translation quality notes, missed terms, or follow-up requests."
                className="mt-2 min-h-24 text-[13px]"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {submitted ? "Close" : "Cancel"}
          </Button>
          {submitted ? null : (
            <Button onClick={submit} disabled={submitFeedback.isPending || feedbackState.isLoading}>
              {submitFeedback.isPending ? (
                <Spinner weight="light" className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <PaperPlaneRight weight="light" className="mr-1.5 h-3.5 w-3.5" />
              )}
              Submit feedback
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
