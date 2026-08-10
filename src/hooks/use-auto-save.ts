"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AutoSaveQueue } from "@/lib/ui/auto-save-queue";

export type { AutoSaveStatus } from "@/lib/ui/auto-save-queue";
import type { AutoSaveStatus } from "@/lib/ui/auto-save-queue";

type UseAutoSaveQueueOptions<T> = {
  save: (payload: T) => Promise<unknown>;
  onError?: (error: unknown) => void;
};

/**
 * Keeps auto-save requests ordered and in memory for the current page session.
 * A failed request remains at the head of the queue until the user retries.
 */
export function useAutoSaveQueue<T>({ save, onError }: UseAutoSaveQueueOptions<T>) {
  const saveRef = useRef(save);
  const [status, setStatus] = useState<AutoSaveStatus>("saved");
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [queue] = useState(
    () =>
      new AutoSaveQueue(
        save,
        ({ status: nextStatus, hasPendingChanges: pending }) => {
          setStatus(nextStatus);
          setHasPendingChanges(pending);
        },
        onError,
      ),
  );

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    queue.setHandlers(saveRef.current, onError);
  }, [onError, queue]);

  useEffect(() => {
    if (!hasPendingChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasPendingChanges]);

  const enqueue = useCallback((payload: T) => {
    queue.enqueue(payload);
  }, [queue]);

  const retry = useCallback(() => {
    queue.retry();
  }, [queue]);

  return {
    enqueue,
    retry,
    status,
    hasPendingChanges,
  };
}
