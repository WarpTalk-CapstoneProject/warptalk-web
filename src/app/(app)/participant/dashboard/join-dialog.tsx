"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function JoinByCodeDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const router = useRouter();

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`/join?code=${encodeURIComponent(trimmed)}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex h-8 items-center justify-center rounded-full bg-neutral-950 px-3 text-sm font-medium text-white transition hover:bg-neutral-800">
          Join by code
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Join Translation Room</DialogTitle>
          <DialogDescription>
            Enter the meeting code provided by your host to join the room.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleJoin} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="roomCode">Room Code</Label>
            <Input
              id="roomCode"
              placeholder="e.g. WARP-241"
              className="font-mono uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={!code.trim()}>
            Continue to Setup
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
