"use client";

/**
 * The document itself, on the page that asks you to approve it.
 *
 * An approver's question is "may this go into the workspace's AI context", and until recently
 * the only way to answer it was to download the file and open it in another application.
 *
 * WHAT IS RENDERED
 *   markdown — rendered. It used to be shown as source, on the argument that an approver reads
 *              it for what it says. That argument was wrong in practice: a 40KB report arrived
 *              as a wall of `#`, `**` and `|` with its tables unreadable, which is harder to
 *              judge, not easier. The renderer already exists for WarpBot and does not execute
 *              raw HTML, so the dependency and the sanitiser were both already paid for.
 *   text     — as text, monospaced. Logs and CSV are read by their alignment.
 *   image    — as the image.
 *   pdf      — the browser's own viewer.
 *   docx     — converted to HTML in the browser (mammoth). Styling is dropped; structure —
 *              headings, lists, tables — survives, which is what a reader needs.
 *   xlsx     — the first sheets as tables (exceljs), bounded, because a spreadsheet with 50,000
 *              rows is not a preview and would lock the tab up.
 *   other    — SAYS it cannot preview, rather than showing an empty box.
 *
 * EVERYTHING IS PARSED IN THE BROWSER, FROM THE DOWNLOAD BYTES
 *   The same endpoint the Download button uses, so what is shown is what will be downloaded —
 *   never a separately generated preview that can drift from the file. Nothing is uploaded
 *   anywhere to be converted: a document pending approval is exactly the document nobody has
 *   agreed to share yet.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Download, Spinner, Warning } from "@phosphor-icons/react";

import { AssistantMarkdown } from "@/components/assistant/assistant-markdown";
import { WorkspaceService } from "@/services/workspace.service";

/** Extensions we can show without converting anything. */
const TEXT_EXTENSIONS = [
  ".md",
  ".txt",
  ".csv",
  ".json",
  ".log",
  ".xml",
  ".yml",
  ".yaml",
];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"];
const MARKDOWN_EXTENSIONS = [".md", ".markdown"];
const WORD_EXTENSIONS = [".docx"];
const SHEET_EXTENSIONS = [".xlsx", ".xlsm"];

/** A preview, not the whole workbook. Beyond this a spreadsheet is a download, not a read. */
const MAX_SHEET_ROWS = 200;
const MAX_SHEETS = 5;

/** Big enough for a long report, small enough not to lock the tab up rendering one string. */
const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

type PreviewKind = "markdown" | "text" | "image" | "pdf" | "word" | "sheet" | "unsupported";

function previewKind(fileExtension: string): PreviewKind {
  const ext = fileExtension.toLowerCase();
  // Markdown before text: .md is in both lists, and rendered beats raw.
  if (MARKDOWN_EXTENSIONS.includes(ext)) return "markdown";
  if (TEXT_EXTENSIONS.includes(ext)) return "text";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if (WORD_EXTENSIONS.includes(ext)) return "word";
  if (SHEET_EXTENSIONS.includes(ext)) return "sheet";
  return "unsupported";
}

/** Auto-detects UTF-16LE/BE and UTF-8 BOMs/null byte ratios to decode text files cleanly. */
export async function decodeTextBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 2) {
    // UTF-16LE BOM (\xFF\xFE)
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(buffer);
    }
    // UTF-16BE BOM (\xFE\xFF)
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(buffer);
    }
    // UTF-8 BOM (\xEF\xBB\xBF)
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder("utf-8").decode(buffer.slice(3));
    }
  }

  // BOM-less heuristic: count null bytes in even vs odd positions
  if (bytes.length >= 4) {
    let nullsEven = 0;
    let nullsOdd = 0;
    const sampleSize = Math.min(bytes.length, 1024);
    for (let i = 0; i < sampleSize; i++) {
      if (bytes[i] === 0x00) {
        if (i % 2 === 0) nullsEven++;
        else nullsOdd++;
      }
    }
    if (nullsOdd > sampleSize * 0.15) {
      return new TextDecoder("utf-16le").decode(buffer);
    }
    if (nullsEven > sampleSize * 0.15) {
      return new TextDecoder("utf-16be").decode(buffer);
    }
  }

  return new TextDecoder("utf-8").decode(buffer);
}

export function DocumentPreview({
  workspaceId,
  documentId,
  fileName,
  fileExtension,
  sizeBytes,
  onDownload,
}: {
  workspaceId: string;
  documentId: string;
  fileName: string;
  fileExtension: string;
  sizeBytes: number;
  onDownload: () => void;
}) {
  const kind = previewKind(fileExtension);
  const isTextual = kind === "text" || kind === "markdown";
  const tooLargeToRead = isTextual && sizeBytes > MAX_TEXT_PREVIEW_BYTES;
  const canPreview = kind !== "unsupported" && !tooLargeToRead;

  const {
    data: blob,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["workspace-document-preview", workspaceId, documentId],
    queryFn: () => WorkspaceService.downloadDocument(workspaceId, documentId),
    enabled: Boolean(workspaceId) && Boolean(documentId) && canPreview,
    // The bytes of a stored file do not change under us: a document is replaced by uploading a
    // new one, which is a different id.
    staleTime: Infinity,
  });

  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || !isTextual) return;
    let cancelled = false;
    void decodeTextBlob(blob).then((value) => {
      if (!cancelled) setText(value);
    });
    return () => {
      cancelled = true;
    };
  }, [blob, isTextual]);

  // docx -> HTML, in this tab. mammoth drops styling and keeps structure, which is the half a
  // reader needs; it is imported lazily so a page showing a PNG never pays for the converter.
  const [wordHtml, setWordHtml] = useState<string | null>(null);
  const [parseFailed, setParseFailed] = useState(false);
  useEffect(() => {
    if (!blob || kind !== "word") return;
    let cancelled = false;
    void (async () => {
      try {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.convertToHtml({
          arrayBuffer: await blob.arrayBuffer(),
        });
        if (!cancelled) setWordHtml(value);
      } catch {
        // A file mammoth cannot read is a file to download, not a crash. The notice below says so.
        if (!cancelled) setParseFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, kind]);

  // xlsx -> a bounded set of tables. Reading every sheet of a large workbook into the DOM is how
  // a preview becomes a hang, so both the sheet count and the row count are capped and the cap
  // is stated on screen rather than silently truncating.
  const [sheets, setSheets] = useState<{ name: string; rows: string[][]; truncated: boolean }[] | null>(
    null,
  );
  useEffect(() => {
    if (!blob || kind !== "sheet") return;
    let cancelled = false;
    void (async () => {
      try {
        const ExcelJS = (await import("exceljs")).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await blob.arrayBuffer());
        const parsed = workbook.worksheets.slice(0, MAX_SHEETS).map((sheet) => {
          const rows: string[][] = [];
          sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber > MAX_SHEET_ROWS) return;
            const values = Array.isArray(row.values) ? row.values.slice(1) : [];
            rows.push(values.map((cell) => (cell == null ? "" : String(cell))));
          });
          return { name: sheet.name, rows, truncated: sheet.rowCount > MAX_SHEET_ROWS };
        });
        if (!cancelled) setSheets(parsed);
      } catch {
        if (!cancelled) setParseFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, kind]);

  // Object URLs are a leak if they are not revoked, and this page is reachable repeatedly from
  // the list.
  const objectUrl = useMemo(() => {
    if (!blob || (kind !== "image" && kind !== "pdf")) return null;
    return URL.createObjectURL(blob);
  }, [blob, kind]);
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  if (!canPreview) {
    return (
      <PreviewNotice
        title={
          tooLargeToRead
            ? "Too large to preview here"
            : `No preview for ${fileExtension.replace(".", "").toUpperCase() || "this format"} files`
        }
        detail={
          tooLargeToRead
            ? "The file is shown in full when downloaded."
            : "There is no in-browser reader for this format. Download it to read it."
        }
        onDownload={onDownload}
        fileName={fileName}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13px] text-ink-muted">
        <Spinner className="h-4 w-4 animate-spin" />
        Loading {fileName}…
      </div>
    );
  }

  if (isError) {
    return (
      <PreviewNotice
        title="Could not read the file"
        detail="The document exists — the server did not return its contents. Downloading may still work."
        onDownload={onDownload}
        fileName={fileName}
      />
    );
  }

  if (parseFailed) {
    return (
      <PreviewNotice
        title={`Could not read this ${fileExtension.replace(".", "").toUpperCase()} file`}
        detail="The file downloaded, but converting it in the browser failed. Downloading and opening it in its own application will still work."
        onDownload={onDownload}
        fileName={fileName}
      />
    );
  }

  if (kind === "markdown") {
    return (
      <div className="text-[13px] text-ink">
        <AssistantMarkdown>{text ?? ""}</AssistantMarkdown>
      </div>
    );
  }

  if (kind === "text") {
    return (
      <pre className="w-full overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.7] text-ink">
        {text ?? ""}
      </pre>
    );
  }

  if (kind === "image" && objectUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- an object URL, not a served asset
    return <img src={objectUrl} alt={fileName} className="max-w-full rounded-lg" />;
  }

  if (kind === "pdf" && objectUrl) {
    // Fills the preview pane, which now owns the scrolling — see the page's grid.
    return (
      <iframe src={objectUrl} title={fileName} className="h-full min-h-[60vh] w-full" />
    );
  }

  if (kind === "word") {
    if (wordHtml === null) return <ParsingNotice fileName={fileName} />;
    return (
      /* mammoth emits headings, lists and tables and no <script>; the prose styling is ours
         because the document's own styling is deliberately dropped. */
      <div
        className="document-preview-html text-[13px] leading-relaxed text-ink [&_h1]:mt-4 [&_h1]:text-[16px] [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-[13px] [&_h3]:font-semibold [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:mt-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-hairline [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-hairline [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1"
        dangerouslySetInnerHTML={{ __html: wordHtml }}
      />
    );
  }

  if (kind === "sheet") {
    if (sheets === null) return <ParsingNotice fileName={fileName} />;
    if (sheets.length === 0) {
      return (
        <p className="py-12 text-[12px] text-ink-muted">This workbook has no sheets to show.</p>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {sheets.map((sheet) => (
          <div key={sheet.name}>
            <p className="mb-2 text-[12px] font-semibold text-ink">{sheet.name}</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <tbody>
                  {sheet.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex === 0 ? "bg-surface-2 font-medium" : ""}>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="whitespace-nowrap border border-hairline px-2 py-1 text-ink"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheet.truncated ? (
              /* Said, not silently cut. A reader who cannot see row 201 needs to know row 201
                 exists. */
              <p className="mt-1.5 text-[11px] text-ink-subtle">
                First {MAX_SHEET_ROWS} rows shown — download the file for the rest.
              </p>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function ParsingNotice({ fileName }: { fileName: string }) {
  return (
    <div className="flex items-center gap-2 py-16 text-[13px] text-ink-muted">
      <Spinner className="h-4 w-4 animate-spin" />
      Converting {fileName}…
    </div>
  );
}

function PreviewNotice({
  title,
  detail,
  fileName,
  onDownload,
}: {
  title: string;
  detail: string;
  fileName: string;
  onDownload: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-12">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <Warning className="h-4 w-4 text-amber-500" />
        {title}
      </div>
      <p className="max-w-md text-[12px] leading-relaxed text-ink-muted">{detail}</p>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2"
      >
        <Download className="h-3.5 w-3.5" />
        Download {fileName}
      </button>
    </div>
  );
}
