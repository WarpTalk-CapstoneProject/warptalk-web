"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PaperPlaneRight, Sparkle, ThumbsUp } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ratingFields = [
  {
    key: "overall",
    label: "Overall experience",
    helper: "Room flow, reliability, and comfort.",
  },
  {
    key: "translation",
    label: "Translation quality",
    helper: "Accuracy, timing, and wording.",
  },
  {
    key: "audio",
    label: "Audio clarity",
    helper: "Delay, stability, and speaker separation.",
  },
  {
    key: "summary",
    label: "AI summary",
    helper: "Usefulness of notes and action items.",
  },
] as const;

const recentFeedback = [
  {
    room: "Board sync with Hanoi team",
    score: "4.8",
    note: "Summary captured follow-ups cleanly.",
    status: "Reviewed",
  },
  {
    room: "Partner onboarding call",
    score: "4.5",
    note: "Audio was clear after the first minute.",
    status: "Queued",
  },
  {
    room: "Support escalation review",
    score: "4.2",
    note: "Speaker labels need a second pass.",
    status: "Open",
  },
];

type RatingKey = (typeof ratingFields)[number]["key"];

export default function FeedbackPage() {
  const [ratings, setRatings] = useState<Record<RatingKey, number>>({
    overall: 0,
    translation: 0,
    audio: 0,
    summary: 0,
  });
  const [comments, setComments] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const averageScore = useMemo(() => {
    const selected = Object.values(ratings).filter(Boolean);
    if (!selected.length) return "0.0";
    return (selected.reduce((sum, score) => sum + score, 0) / selected.length).toFixed(1);
  }, [ratings]);

  function updateRating(key: RatingKey, value: number) {
    setRatings((current) => ({
      ...current,
      [key]: current[key] === value ? 0 : value,
    }));
    setSubmitted(false);
  }

  function submitPreview() {
    if (!ratings.overall) {
      toast.error("Select an overall score before submitting.");
      return;
    }

    setSubmitted(true);
    toast.success("Preview feedback captured.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/history" className={cn(buttonVariants({ variant: "outline" }))}>
          View history
        </Link>
        <Button onClick={submitPreview}>
          <PaperPlaneRight weight="light" className="mr-2 h-4 w-4" />
          Submit preview
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Room quality form</CardTitle>
                <CardDescription>Shadcn feedback surface for an ended room.</CardDescription>
              </div>
              <Badge variant={submitted ? "default" : "secondary"}>
                {submitted ? "Captured" : "Draft"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {ratingFields.map((field) => (
                <div key={field.key} className="rounded-lg border  p-4">
                  <div className="mb-3">
                    <Label className="text-sm font-semibold">{field.label}</Label>
                    <p className="text-sm text-muted-foreground">{field.helper}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        aria-pressed={ratings[field.key] === score}
                        onClick={() => updateRating(field.key, score)}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition-colors",
                          ratings[field.key] === score
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
              <Label htmlFor="feedback-comments">Host notes</Label>
              <Textarea
                id="feedback-comments"
                value={comments}
                onChange={(event) => {
                  setComments(event.target.value);
                  setSubmitted(false);
                }}
                placeholder="Add translation quality notes, missed terms, or follow-up requests."
                className="min-h-32"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Operational signal</CardTitle>
              <CardDescription>What the quality team sees first.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkle weight="light" className="h-4 w-4 text-primary" />
                  Recommended action
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Prioritize sessions below 4.3 or notes that mention terminology drift.
                </p>
              </div>
              <div className="rounded-lg border  p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ThumbsUp weight="light" className="h-4 w-4 text-primary" />
                  Current sentiment
                </div>
                <p className="mt-2 text-2xl font-bold">{averageScore}/5</p>
                <p className="text-sm text-muted-foreground">Based on selected preview ratings.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Recent feedback</CardTitle>
              <CardDescription>Sample queue for review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentFeedback.map((item) => (
                <div key={item.room} className="rounded-lg border  p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.room}</p>
                      <p className="text-sm text-muted-foreground">{item.note}</p>
                    </div>
                    <Badge variant="outline">{item.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{item.score}/5</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
