export type BlobSaveResult = "picker" | "download" | "cancelled";

interface WritableFileLike {
  write(value: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  createWritable(): Promise<WritableFileLike>;
}

interface DownloadAnchorLike {
  href: string;
  download: string;
  style: Record<string, string>;
  click(): void;
  remove?: () => void;
}

export interface BrowserWindowLike {
  isSecureContext?: boolean;
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<FileHandleLike>;
  URL?: {
    createObjectURL(value: Blob): string;
    revokeObjectURL(url: string): void;
  };
  document?: {
    createElement(tagName: string): DownloadAnchorLike;
    body: { appendChild(element: DownloadAnchorLike): void };
  };
}

type BlobLoader = () => Blob | Promise<Blob>;

function isPickerCancellation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function triggerBrowserDownload(
  loadBlob: BlobLoader,
  fileName: string,
  browserWindow: BrowserWindowLike,
): Promise<"download"> {
  if (!browserWindow.URL || !browserWindow.document) {
    throw new Error("The browser cannot save this file.");
  }

  const blob = await loadBlob();
  const url = browserWindow.URL.createObjectURL(blob);
  try {
    const anchor = browserWindow.document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = "none";
    browserWindow.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove?.();
    return "download";
  } finally {
    browserWindow.URL.revokeObjectURL(url);
  }
}

/**
 * Download an authenticated Blob through the native file picker when available.
 * The picker must open before awaiting the API request to preserve user activation.
 */
export async function downloadBlob(
  loadBlob: BlobLoader,
  fileName: string,
  browserWindow: BrowserWindowLike = window as unknown as BrowserWindowLike,
): Promise<BlobSaveResult> {
  if (browserWindow.isSecureContext !== false && browserWindow.showSaveFilePicker) {
    // Open the picker before awaiting the authenticated API request. The browser
    // only allows this API while the original click still has user activation.
    try {
      const handle = await browserWindow.showSaveFilePicker({ suggestedName: fileName });
      const blob = await loadBlob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "picker";
    } catch (error: unknown) {
      if (isPickerCancellation(error)) return "cancelled";
      // A browser permission/picker error should still leave the user with a usable download.
    }
  }

  return triggerBrowserDownload(loadBlob, fileName, browserWindow);
}
