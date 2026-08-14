"use client";

/**
 * How a meeting is rated, once it is over.
 *
 * It used to be a page-wide rounded Card with the form inside it, its two actions floating in a
 * right-aligned row ABOVE the card they act on, and the four ratings as bordered boxes in a
 * two-column grid — each box repeating a border the card already drew, with its five score
 * buttons wrapping underneath the label.
 *
 * It is the workspace chrome now: square, flat, actions ranked in the one toolbar row, and each
 * rating a single line with its scores on the right where the eye already is. Four questions
 * that fit on four lines were taking up half a screen.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { PaperPlaneRight, Spinner, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspacePage,
  WorkspacePrimaryButton,
  WorkspaceSecondaryButton,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
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
  // Workspace-scoped, like every other route in this segment. The two links out of this page
  // pointed at a bare "/history", which is not a route: history lives under the workspace slug,
  // so both of them 404'd.
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const historyHref = `/${workspaceSlug}/history`;
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
  const displayRatings =
    submitted && existing
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
    if (submitted) return;
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
      <WorkspacePage>
        <WorkspaceBody className="pt-6">
          <WorkspaceEmptyState
            title="Select a completed room"
            description="Feedback is left against one meeting, and this page was opened without one."
            action={
              <Link href={historyHref}>
                <WorkspaceSecondaryButton>View history</WorkspaceSecondaryButton>
              </Link>
            }
          />
        </WorkspaceBody>
      </WorkspacePage>
    );
  }

  if (feedbackState.isLoading) return <FeedbackLoading />;

  if (feedbackState.isError) {
    return (
      <WorkspacePage>
        <WorkspaceBody className="pt-6">
          <WorkspaceEmptyState
            icon={<WarningCircle className="h-6 w-6" />}
            title="Feedback unavailable"
            description={getErrorMessage(feedbackState.error, "Could not load feedback state.")}
            action={
              <WorkspaceSecondaryButton onClick={() => feedbackState.refetch()}>
                Retry
              </WorkspaceSecondaryButton>
            }
          />
        </WorkspaceBody>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <>
            <Badge variant={submitted ? "default" : "secondary"}>
              {submitted ? "Submitted" : "Draft"}
            </Badge>
            {selectedRatings.length ? (
              <span className="text-[13px] tabular-nums text-ink-muted">{averageScore} / 5</span>
            ) : null}
          </>
        }
        actions={
          <>
            <Link href={historyHref}>
              <WorkspaceSecondaryButton>View history</WorkspaceSecondaryButton>
            </Link>
            <WorkspacePrimaryButton
              onClick={submit}
              disabled={submitted || submitFeedback.isPending}
              icon={
                submitFeedback.isPending ? (
                  <Spinner weight="light" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PaperPlaneRight weight="light" className="h-3.5 w-3.5" />
                )
              }
            >
              {submitted ? "Submitted" : "Submit feedback"}
            </WorkspacePrimaryButton>
          </>
        }
      />

      <WorkspaceBody>
        <div className="max-w-3xl">
          {/* One question per line, scores on the right. The grid of bordered boxes this
              replaced drew four more borders inside a page that already had one, and pushed
              four short questions down half a screen. */}
          <div className="border-y border-hairline">
            {ratingFields.map((field) => (
              <div
                key={field.key}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-1 py-3 last:border-b-0"
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

          <div className="mt-5">
            <Label htmlFor="feedback-comments" className="text-[13px] font-medium text-ink">
              Notes
            </Label>
            <Textarea
              id="feedback-comments"
              value={submitted ? (existing?.comments ?? "") : comments}
              disabled={submitted}
              onChange={(event) => setComments(event.target.value)}
              placeholder="Translation quality notes, missed terms, or follow-up requests."
              className="mt-2 min-h-28 text-[13px]"
            />
          </div>
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  );
}

function FeedbackLoading() {
  return (
    <WorkspacePage>
      <WorkspaceBody className="pt-6">
        <div className="flex min-h-48 items-center justify-center text-[13px] text-ink-muted">
          <Spinner weight="light" className="mr-2 h-4 w-4 animate-spin" />
          Loading feedback
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  );
}
