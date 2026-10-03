"use client";

import { useEffect, useRef } from "react";

import { createPublishSupervisor, type PublishSupervisor } from "@/lib/meeting/publish-supervisor";

/**
 * Keeps one bridge track (the Meet window, the Meet audio) on the wire while `enabled`: the single
 * owner of re-publishing it (lib/meeting/publish-supervisor.ts has the loop and its guarantees).
 *
 * `kick` true brings the next check forward to now: when it turns true, and when the supervisor
 * starts while it is true. It never restarts the loop, so failures and the back-off survive it.
 */
export function useSupervisedPublish({
  enabled,
  kick = false,
  publish,
  label,
}: {
  enabled: boolean;
  kick?: boolean;
  publish: () => Promise<string> | null;
  /** For the console: "Meet window", "Meet audio". */
  label: string;
}): void {
  const publishRef = useRef(publish);
  useEffect(() => {
    publishRef.current = publish;
  });
  // One supervisor per label for the component's life; its state (failures, back-off) is not React
  // state. Effects run in order, so it exists before the two below read it.
  const supervisorRef = useRef<PublishSupervisor | null>(null);
  useEffect(() => {
    const supervisor = createPublishSupervisor({ publish: () => publishRef.current(), label });
    supervisorRef.current = supervisor;
    return () => {
      supervisor.stop();
      supervisorRef.current = null;
    };
  }, [label]);

  useEffect(() => {
    const supervisor = supervisorRef.current;
    if (!enabled || !supervisor) return;
    supervisor.start();
    return () => supervisor.stop();
  }, [enabled, label]);

  // After the start effect, so on a commit that enables and kicks, start runs first.
  useEffect(() => {
    if (enabled && kick) supervisorRef.current?.kick();
  }, [enabled, kick, label]);
}
