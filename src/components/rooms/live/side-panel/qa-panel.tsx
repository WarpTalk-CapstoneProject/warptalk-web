"use client";

import { useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { CheckCircle, PaperPlaneTilt, ThumbsUp } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAskQuestion, useAnswerQuestion, useQuestions, useUpvoteQuestion } from "@/hooks/use-qa";
import { useAuthStore } from "@/stores/auth-store";
import type { QuestionDto } from "@/types/question";
import { getErrorMessage } from "@/lib/api/errors";

export function QaPanel({ roomId, isHost }: { roomId: string; isHost: boolean }) {
  const user = useAuthStore((state) => state.user);
  const questionsQuery = useQuestions(roomId);
  const askQuestion = useAskQuestion(roomId);
  const [body, setBody] = useState("");

  const questions = [...(questionsQuery.data ?? [])].sort((a, b) => {
    if (b.upvoteCount !== a.upvoteCount) return b.upvoteCount - a.upvoteCount;
    return a.createdAt.localeCompare(b.createdAt);
  });

  async function handleAsk() {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await askQuestion.mutateAsync({ body: trimmed, displayName: user?.fullName });
      setBody("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not submit your question."));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleAsk();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {questionsQuery.isLoading ? <p className="text-[13px] text-ink-subtle">Loading questions…</p> : null}
        {questionsQuery.isError ? <p className="text-[13px] text-red-600">Could not load questions.</p> : null}
        {!questionsQuery.isLoading && questions.length === 0 ? (
          <p className="text-[13px] text-ink-subtle">No questions yet. Be the first to ask.</p>
        ) : null}

        {questions.map((question) => (
          <QuestionRow key={question.id} roomId={roomId} question={question} isHost={isHost} />
        ))}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            placeholder="Ask a question…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={1000}
            className="min-h-9 resize-none bg-surface-1"
            rows={1}
          />
          <Button size="icon" onClick={handleAsk} disabled={!body.trim() || askQuestion.isPending} title="Ask">
            <PaperPlaneTilt className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuestionRow({
  roomId,
  question,
  isHost,
}: {
  roomId: string;
  question: QuestionDto;
  isHost: boolean;
}) {
  const upvote = useUpvoteQuestion(roomId);
  const answer = useAnswerQuestion(roomId);
  const isAnswered = question.status === "answered";

  async function handleUpvote() {
    try {
      await upvote.mutateAsync(question.id);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update your upvote."));
    }
  }

  async function handleAnswer() {
    try {
      await answer.mutateAsync(question.id);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not mark this question answered."));
    }
  }

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border border-border bg-canvas p-2.5 ${isAnswered ? "opacity-60" : ""}`}>
      <button
        onClick={handleUpvote}
        disabled={upvote.isPending}
        className={`flex shrink-0 flex-col items-center gap-0.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
          question.upvotedByMe ? "border-primary bg-primary/10 text-primary" : "border-border text-ink-subtle hover:bg-surface-2"
        }`}
        title={question.upvotedByMe ? "Remove upvote" : "Upvote"}
      >
        <ThumbsUp className="h-3.5 w-3.5" weight={question.upvotedByMe ? "fill" : "regular"} />
        {question.upvoteCount}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-[13px] text-ink ${isAnswered ? "line-through text-ink-subtle" : ""}`}>{question.body}</p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-subtle">
          <span className="truncate">{question.askedByDisplayName}</span>
          {isAnswered ? (
            <span className="flex items-center gap-0.5 text-green-600">
              <CheckCircle className="h-3 w-3" weight="fill" /> Answered
            </span>
          ) : null}
        </div>
      </div>

      {isHost && !isAnswered ? (
        <button
          onClick={handleAnswer}
          disabled={answer.isPending}
          className="shrink-0 text-[11px] font-medium text-primary hover:text-primary-hover disabled:opacity-50"
        >
          Mark answered
        </button>
      ) : null}
    </div>
  );
}
