"use client";

/**
 * Rating a meeting, from the meeting's own page.
 *
 * WHERE THIS HAS BEEN
 *   It was `/[workspaceSlug]/feedback?roomId=…` — a whole route whose entire content was four
 *   score rows and a note box. A route has to carry the meeting id in the query string, has to
 *   handle arriving without one, and takes the reader away from the thing they are rating. It
 *   became a dialog on the post-meeting page instead, and now that page is gone too: the record
 *   lives on the meeting, so the rating does as well.
 *
 * WHY A POPOVER AND NOT A DIALOG
 *   A dialog takes the page away to ask four optional questions about a meeting the reader may
 *   have opened to do something else entirely. Anchored to its own control, the form is offered
 *   rather than imposed, and dismissing it costs nothing.
 *
 *   The cost is discoverability, which WT-449 spent a ticket buying: that dialog OPENED itself
 *   on an unrated meeting, because feedback that has to be hunted for is feedback nobody leaves.
 *   The trigger carries that weight now — an unrated meeting gets a filled star and a dot, a
 *   rated one gets its own score back — so the control still asks, without seizing the page.
 *
 * ALREADY-SUBMITTED IS A STATE, NOT A REFUSAL
 *   Feedback is once per person per meeting. Rather than hide the form, it shows what was
 *   submitted, read-only — otherwise reopening it looks like the submission was lost.
 */

import { useState } from "react";
import { PaperPlaneRight, Spinner, Star, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

export function MeetingFeedbackMenu({
  roomId,
  meetingTitle,
}: {
  roomId: string;
  /** Shown under the title so it is obvious which meeting is being rated. */
  meetingTitle?: string | null;
}) {
  const [open, setOpen] = useState(false);

  // Read before the popover opens, unlike the dialog this replaces — the trigger has to know
  // whether this meeting has been rated in order to say so, and that is the whole reason the
  // control can carry WT-449's prompt without opening itself. One small GET, and only on a
  // meeting that has ended: the caller does not render this until then.
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
  // `=== true` rather than truthiness: while the query is in flight the value is undefined, and
  // "not known yet" must not be rendered as either answer.
  const submitted = feedbackState.data?.hasSubmitted === true;
  const unrated = feedbackState.data?.hasSubmitted === false;
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
      setOpen(false);
    } catch (error) {
      // Left open on purpose: a failed submit must not look like a completed one, and the
      // answers already given are still in the form.
      toast.error(getErrorMessage(error, "Could not submit feedback."));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={submitted ? "Your rating for this meeting" : "Rate this meeting"}
        aria-label={submitted ? "Your rating for this meeting" : "Rate this meeting"}
        className={cn(
          "relative inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-[12px] font-medium transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          unrated ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground hover:text-ink",
        )}
      >
        <Star size={14} weight={unrated || submitted ? "fill" : "regular"} />
        {submitted && existing ? existing.overallRating : null}
        {/* The prompt, reduced to a dot. An unrated meeting has something to ask of the reader
            and this is how the control says so without opening on top of the page. */}
        {unrated ? (
          <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-amber-500" />
        ) : null}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[420px] max-w-[calc(100vw-2rem)] gap-0 p-4">
        <p className="text-[13px] font-semibold text-ink">
          {submitted ? "Your feedback" : "Rate this meeting"}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-ink-muted">
          {meetingTitle || "Ratings are per meeting and are visible to the workspace admins."}
        </p>

        {feedbackState.isLoading ? (
          <div className="flex min-h-32 items-center justify-center text-[13px] text-ink-muted">
            <Spinner weight="light" className="mr-2 h-4 w-4 animate-spin" />
            Loading feedback
          </div>
        ) : feedbackState.isError ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-center">
            <WarningCircle className="h-5 w-5 text-ink-muted" />
            <p className="text-[13px] text-ink-muted">
              {getErrorMessage(feedbackState.error, "Could not load feedback state.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => feedbackState.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* One question per line, scores on the right where the eye already is. */}
            <div className="mt-3 border-y border-hairline">
              {ratingFields.map((field) => (
                <div
                  key={field.key}
                  // Not `flex-wrap`: the row it wrapped was the one with the longest helper, so
                  // a single question dropped its scores onto a second line while the three
                  // around it kept theirs inline, and the column of buttons stopped being a
                  // column. The helper text wraps instead — it is the part that can.
                  className="flex items-center justify-between gap-3 border-b border-hairline py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <Label className="text-[12.5px] font-medium text-ink">{field.label}</Label>
                    <p className="mt-0.5 text-[11.5px] text-ink-muted">{field.helper}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        disabled={submitted}
                        aria-label={`${field.label}: ${score} out of 5`}
                        aria-pressed={displayRatings[field.key] === score}
                        onClick={() => updateRating(field.key, score)}
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-md border text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70",
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

            <div className="mt-3">
              <Label htmlFor="feedback-comments" className="text-[12.5px] font-medium text-ink">
                Notes
              </Label>
              <Textarea
                id="feedback-comments"
                value={submitted ? (existing?.comments ?? "") : comments}
                disabled={submitted}
                onChange={(event) => setComments(event.target.value)}
                placeholder="Translation quality notes, missed terms, or follow-up requests."
                className="mt-1.5 min-h-20 text-[12.5px]"
              />
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                {submitted ? "Close" : "Cancel"}
              </Button>
              {submitted ? null : (
                <Button
                  size="sm"
                  onClick={submit}
                  disabled={submitFeedback.isPending || feedbackState.isLoading}
                >
                  {submitFeedback.isPending ? (
                    <Spinner weight="light" className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PaperPlaneRight weight="light" className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Submit feedback
                </Button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
