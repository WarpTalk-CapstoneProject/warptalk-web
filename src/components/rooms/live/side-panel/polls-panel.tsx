"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash, Lock } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useClosePoll, useCreatePoll, usePolls, useVotePoll } from "@/hooks/use-polls";
import type { PollDto } from "@/types/poll";
import { getErrorMessage } from "@/lib/api/errors";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export function PollsPanel({ roomId, isHost }: { roomId: string; isHost: boolean }) {
  const pollsQuery = usePolls(roomId);
  const polls = pollsQuery.data ?? [];

  const openPolls = [...polls].filter((p) => p.status === "open").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const closedPolls = [...polls].filter((p) => p.status === "closed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {isHost ? <CreatePollForm roomId={roomId} /> : null}

      {pollsQuery.isLoading ? <p className="text-[13px] text-ink-subtle">Loading polls…</p> : null}
      {pollsQuery.isError ? <p className="text-[13px] text-red-600">Could not load polls.</p> : null}
      {!pollsQuery.isLoading && polls.length === 0 ? (
        <p className="text-[13px] text-ink-subtle">No polls yet.{isHost ? "" : " Waiting for the host to start one."}</p>
      ) : null}

      {[...openPolls, ...closedPolls].map((poll) => (
        <PollCard key={poll.id} roomId={roomId} poll={poll} isHost={isHost} />
      ))}
    </div>
  );
}

function CreatePollForm({ roomId }: { roomId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const createPoll = useCreatePoll(roomId);

  function reset() {
    setQuestion("");
    setOptions(["", ""]);
    setIsMultipleChoice(false);
    setExpanded(false);
  }

  function updateOption(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? value : option)));
  }

  function addOption() {
    setOptions((current) => (current.length < MAX_OPTIONS ? [...current, ""] : current));
  }

  function removeOption(index: number) {
    setOptions((current) => (current.length > MIN_OPTIONS ? current.filter((_, i) => i !== index) : current));
  }

  async function handleSubmit() {
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((option) => option.trim()).filter(Boolean);
    if (!trimmedQuestion) {
      toast.error("Add a question for the poll.");
      return;
    }
    if (trimmedOptions.length < MIN_OPTIONS) {
      toast.error(`Add at least ${MIN_OPTIONS} options.`);
      return;
    }
    try {
      await createPoll.mutateAsync({ question: trimmedQuestion, options: trimmedOptions, isMultipleChoice });
      toast.success("Poll launched.");
      reset();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create poll."));
    }
  }

  if (!expanded) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setExpanded(true)}>
        <Plus className="h-3.5 w-3.5" />
        Create poll
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-canvas p-3">
      <Input placeholder="Ask a question…" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} />

      <div className="flex flex-col gap-1.5">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              placeholder={`Option ${index + 1}`}
              value={option}
              onChange={(e) => updateOption(index, e.target.value)}
              maxLength={120}
            />
            {options.length > MIN_OPTIONS ? (
              <button
                onClick={() => removeOption(index)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-ink-muted hover:bg-surface-2 hover:text-red-600"
                title="Remove option"
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {options.length < MAX_OPTIONS ? (
        <button onClick={addOption} className="self-start text-[12px] font-medium text-primary hover:text-primary-hover">
          + Add option
        </button>
      ) : null}

      <label className="flex items-center gap-2 text-[13px] text-ink-subtle cursor-pointer">
        <Checkbox checked={isMultipleChoice} onCheckedChange={(checked) => setIsMultipleChoice(checked)} />
        Allow multiple choices
      </label>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={handleSubmit} disabled={createPoll.isPending}>
          {createPoll.isPending ? "Creating…" : "Launch poll"}
        </Button>
        <Button size="sm" variant="ghost" onClick={reset}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PollCard({ roomId, poll, isHost }: { roomId: string; poll: PollDto; isHost: boolean }) {
  const [selected, setSelected] = useState<string[]>(poll.myVotedOptionIds);
  const voteMutation = useVotePoll(roomId);
  const closeMutation = useClosePoll(roomId);
  const isOpen = poll.status === "open";
  const totalVotes = poll.options.reduce((sum, option) => sum + option.voteCount, 0);
  const hasVoted = poll.myVotedOptionIds.length > 0;
  const sortedSelected = [...selected].sort();
  const sortedVoted = [...poll.myVotedOptionIds].sort();
  const dirty = isOpen && JSON.stringify(sortedSelected) !== JSON.stringify(sortedVoted);

  async function submitVote(optionIds: string[]) {
    if (optionIds.length === 0) return;
    try {
      await voteMutation.mutateAsync({ pollId: poll.id, data: { optionIds } });
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not submit vote."));
    }
  }

  function toggleOption(optionId: string) {
    if (!isOpen) return;
    if (poll.isMultipleChoice) {
      setSelected((current) => (current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]));
    } else {
      setSelected([optionId]);
      void submitVote([optionId]);
    }
  }

  async function handleClose() {
    try {
      await closeMutation.mutateAsync(poll.id);
      toast.success("Poll closed.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not close poll."));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-canvas p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-ink">{poll.question}</p>
        {!isOpen ? (
          <span className="flex shrink-0 items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle border border-border">
            <Lock className="h-2.5 w-2.5" /> Closed
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        {poll.options.map((option) => {
          const percent = totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0;
          const isSelected = selected.includes(option.id);
          return (
            <button
              key={option.id}
              onClick={() => toggleOption(option.id)}
              disabled={!isOpen}
              className={`relative overflow-hidden rounded-md border px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                isSelected ? "border-primary" : "border-border"
              } ${isOpen ? "hover:border-primary/60" : "cursor-default"}`}
            >
              <div className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${percent}%` }} />
              <div className="relative flex items-center justify-between gap-2">
                <span className={`truncate ${isSelected ? "font-medium text-ink" : "text-ink"}`}>{option.label}</span>
                <span className="shrink-0 text-ink-subtle">
                  {percent}% ({option.voteCount})
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {poll.isMultipleChoice && isOpen ? (
        <Button size="sm" className="self-start" disabled={!dirty || voteMutation.isPending} onClick={() => submitVote(selected)}>
          {hasVoted ? "Update vote" : "Submit vote"}
        </Button>
      ) : null}

      <div className="flex items-center justify-between text-[11px] text-ink-subtle">
        <span>
          {totalVotes} vote{totalVotes === 1 ? "" : "s"}
        </span>
        {isHost && isOpen ? (
          <button
            onClick={handleClose}
            disabled={closeMutation.isPending}
            className="font-medium text-primary hover:text-primary-hover disabled:opacity-50"
          >
            Close poll
          </button>
        ) : null}
      </div>
    </div>
  );
}
