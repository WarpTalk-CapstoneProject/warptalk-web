"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WindowsLoopbackSource } from "@/lib/desktop/bridge";
import { WINDOWS_CAPTURE_CONSENT } from "@/lib/desktop/virtual-audio";

/**
 * Asks before WarpTalk starts listening to the user's browser on Windows.
 *
 * WHY THIS EXISTS AT ALL
 *   Windows can only scope an audio capture to a process tree. Picking the meeting window does not
 *   narrow it to that window — every other tab making sound in the same browser is captured too,
 *   and reaches the pipeline as if the far side had said it. Measured, not assumed: two tabs
 *   playing different tones both arrived at identical amplitude.
 *
 *   So the ask names the browser, not the window. A dialog that said "we will capture your meeting
 *   window" would be asking permission for one thing and doing another, in the one place where
 *   that matters most.
 *
 * ONLY THE LOOPBACK PATH ASKS
 *   Where a second virtual device exists, the far side arrives on its own endpoint and nothing
 *   else is heard. That path needs no dialog, and showing one there would train people to dismiss
 *   a prompt that sometimes carries real news.
 *
 * DECLINING IS NOT AN ERROR
 *   "Not now" drops to captions — the caller decides how, this component only reports the answer.
 *   A consent prompt whose refusal breaks the product is not a question, and people learn that
 *   within one meeting.
 *
 * The wording lives in `WINDOWS_CAPTURE_CONSENT` rather than here: it is the whole control, it is
 * tested there, and a second copy in JSX is how the tested one stops being the one users read.
 */
export function BrowserCaptureConsentModal({
  open,
  sources,
  selectedSourceId,
  loadingSources,
  onSelectedSourceIdChange,
  onDecision,
}: {
  open: boolean;
  sources: WindowsLoopbackSource[];
  selectedSourceId: string | null;
  loadingSources: boolean;
  onSelectedSourceIdChange: (sourceId: string) => void;
  /** `true` starts the capture, `false` falls back to captions. Never left unanswered. */
  onDecision: (granted: boolean) => void;
}) {
  const canConfirm = Boolean(selectedSourceId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape and the backdrop mean "no". Treating a dismissal as consent is exactly the
        // pattern this dialog exists to avoid.
        if (!next) onDecision(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{WINDOWS_CAPTURE_CONSENT.title}</DialogTitle>
          <DialogDescription>{WINDOWS_CAPTURE_CONSENT.body}</DialogDescription>
        </DialogHeader>

        <p className="text-sm font-medium text-foreground">{WINDOWS_CAPTURE_CONSENT.action}</p>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="browser-capture-source">
            Meeting window
          </label>
          <Select
            value={selectedSourceId ?? ""}
            onValueChange={(sourceId) => {
              if (sourceId) onSelectedSourceIdChange(sourceId);
            }}
            disabled={loadingSources || sources.length === 0}
          >
            <SelectTrigger id="browser-capture-source" className="w-full">
              <SelectValue
                placeholder={loadingSources ? "Finding meeting windows..." : "Choose the Meet browser window"}
              />
            </SelectTrigger>
            <SelectContent>
              {sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!loadingSources && sources.length === 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Open the meeting window in your browser, then start translation again.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onDecision(false)}>
            {WINDOWS_CAPTURE_CONSENT.decline}
          </Button>
          <Button disabled={!canConfirm} onClick={() => onDecision(true)}>
            {WINDOWS_CAPTURE_CONSENT.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
