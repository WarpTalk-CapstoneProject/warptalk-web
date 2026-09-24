"use client";

/**
 * A markdown field with a formatting toolbar, a Write/Preview switch, and image upload — from the
 * toolbar, by pasting, or by dropping a file on it. Uploads go to the announcements asset store
 * and land in the body as `![alt](/api/v1/notifications/announcements/assets/{id})`, which the
 * app renders (and nothing else: the viewer only loads uploaded or https images).
 */

import { useState, type ClipboardEvent, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CircleNotch,
  Code,
  ImageSquare,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Quotes,
  TextB,
  TextHOne,
  TextItalic,
} from "@phosphor-icons/react/dist/ssr";

import { AnnouncementMarkdown } from "@/components/announcements/announcement-surfaces";
import { Textarea } from "@/components/ui/textarea";
import { useUploadAnnouncementAsset } from "@/hooks/use-admin-announcement-cms";
import { imageMarkdown, LIMITS } from "@/lib/announcements/announcement-cms";
import { insertBlock, prefixLines, wrapSelection, type TextEdit } from "@/lib/admin/markdown-format";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function MarkdownEditor({
  id,
  value,
  onChange,
  maxLength,
  placeholder,
  disabled,
  onImageUploaded,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  disabled?: boolean;
  /** Called with the server path of every uploaded image (e.g. to offer it as the hero image). */
  onImageUploaded?: (path: string) => void;
}) {
  const t = useTranslations("adminCms.common.markdown");
  const fileInputId = `${id}-image`;
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [dragging, setDragging] = useState(false);
  const upload = useUploadAnnouncementAsset();

  const apply = (edit: (value: string, start: number, end: number) => TextEdit) => {
    // Looked up by id inside the handler, so nothing reads a ref while rendering.
    const element = document.getElementById(id) as HTMLTextAreaElement | null;
    // The element's own value, not the render's: after an upload resolves, the render's copy is
    // from before the upload started and would drop anything typed meanwhile.
    const current = element?.value ?? value;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    const next = edit(current, start, end);
    onChange(next.value.slice(0, maxLength));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!IMAGE_TYPES.includes(file.type)) {
        toast.error(t("imageType"));
        continue;
      }
      if (file.size > LIMITS.assetBytes) {
        toast.error(t("imageTooLarge"));
        continue;
      }
      try {
        const asset = await upload.mutateAsync(file);
        const alt = file.name.replace(/\.[a-z0-9]+$/i, "");
        apply((current, start) => insertBlock(current, start, imageMarkdown(asset.url, alt)));
        onImageUploaded?.(asset.url);
      } catch (caught) {
        toast.error(getErrorMessage(caught, t("uploadFailed")));
      }
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.files).filter((file) => IMAGE_TYPES.includes(file.type));
    if (images.length === 0) return;
    event.preventDefault();
    void uploadFiles(images);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files);
  };

  const tools = [
    { label: t("bold"), icon: TextB, run: () => apply((v, s, e) => wrapSelection(v, s, e, "**", "**", t("boldPlaceholder"))) },
    { label: t("italic"), icon: TextItalic, run: () => apply((v, s, e) => wrapSelection(v, s, e, "_", "_", t("italicPlaceholder"))) },
    { label: t("heading"), icon: TextHOne, run: () => apply((v, s, e) => prefixLines(v, s, e, "## ")) },
    { label: t("link"), icon: LinkSimple, run: () => apply((v, s, e) => wrapSelection(v, s, e, "[", "](https://)", t("linkPlaceholder"))) },
    { label: t("bulleted"), icon: ListBullets, run: () => apply((v, s, e) => prefixLines(v, s, e, "- ")) },
    { label: t("numbered"), icon: ListNumbers, run: () => apply((v, s, e) => prefixLines(v, s, e, (i) => `${i + 1}. `)) },
    { label: t("quote"), icon: Quotes, run: () => apply((v, s, e) => prefixLines(v, s, e, "> ")) },
    { label: t("code"), icon: Code, run: () => apply((v, s, e) => wrapSelection(v, s, e, "`", "`", "code")) },
  ];

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border bg-surface-1", dragging && "ring-2 ring-primary/40")}
      onDragOver={(event) => {
        if (disabled || mode !== "write") return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={disabled || mode !== "write" ? undefined : onDrop}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <div role="tablist" aria-label={t("mode")} className="mr-1 flex items-center">
          {(["write", "preview"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                "rounded-md px-2 py-1 text-[12px] text-ink-muted hover:text-ink",
                mode === option && "bg-surface-2 font-medium text-ink",
              )}
            >
              {t(option)}
            </button>
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            aria-label={tool.label}
            title={tool.label}
            disabled={disabled || mode !== "write"}
            onClick={tool.run}
            className="flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <tool.icon size={15} />
          </button>
        ))}
        <label
          htmlFor={fileInputId}
          aria-label={t("image")}
          title={t("image")}
          className={cn(
            "flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink",
            (disabled || mode !== "write" || upload.isPending) && "pointer-events-none opacity-40",
          )}
        >
          {upload.isPending ? <CircleNotch size={15} className="animate-spin" /> : <ImageSquare size={15} />}
        </label>
        <input
          id={fileInputId}
          disabled={disabled || mode !== "write" || upload.isPending}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void uploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <span className="ml-auto pr-1.5 text-[11px] tabular-nums text-ink-subtle">
          {value.length.toLocaleString()}/{maxLength.toLocaleString()}
        </span>
      </div>
      {mode === "write" ? (
        <Textarea
          id={id}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          onPaste={onPaste}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[220px] resize-y rounded-none border-0 font-mono text-[12.5px] leading-relaxed shadow-none focus-visible:ring-0"
        />
      ) : (
        <div className="min-h-[220px] px-3 py-2.5">
          {value.trim() ? (
            <AnnouncementMarkdown className="text-[13.5px] leading-relaxed text-ink">{value}</AnnouncementMarkdown>
          ) : (
            <p className="text-[12.5px] text-ink-subtle">{t("nothingToPreview")}</p>
          )}
        </div>
      )}
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-ink-subtle">{t("hint")}</p>
    </div>
  );
}
