export type AutoSaveStatus = "saved" | "saving" | "error";

export type AutoSaveQueueState = {
  status: AutoSaveStatus;
  hasPendingChanges: boolean;
};

export class AutoSaveQueue<T> {
  private readonly jobs: T[] = [];
  private processing = false;
  private failed = false;
  private save: (payload: T) => Promise<unknown>;
  private onStateChange: (state: AutoSaveQueueState) => void;
  private onError?: (error: unknown) => void;

  constructor(
    save: (payload: T) => Promise<unknown>,
    onStateChange: (state: AutoSaveQueueState) => void,
    onError?: (error: unknown) => void,
  ) {
    this.save = save;
    this.onStateChange = onStateChange;
    this.onError = onError;
  }

  setHandlers(
    save: (payload: T) => Promise<unknown>,
    onError?: (error: unknown) => void,
  ) {
    this.save = save;
    this.onError = onError;
  }

  enqueue(payload: T) {
    this.jobs.push(payload);
    if (!this.failed) this.emit("saving");
    void this.process();
  }

  retry() {
    this.failed = false;
    this.emit("saving");
    void this.process();
  }

  private emit(status: AutoSaveStatus) {
    this.onStateChange({ status, hasPendingChanges: this.jobs.length > 0 });
  }

  private async process() {
    if (this.processing || this.failed) return;
    this.processing = true;

    try {
      while (this.jobs.length > 0) {
        this.emit("saving");
        try {
          await this.save(this.jobs[0]);
          this.jobs.shift();
        } catch (error) {
          this.failed = true;
          this.emit("error");
          this.onError?.(error);
          return;
        }
      }

      this.emit("saved");
    } finally {
      this.processing = false;
    }
  }
}
