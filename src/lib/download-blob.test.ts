import assert from "node:assert/strict";
import test from "node:test";

import { downloadBlob } from "./download-blob.ts";

test("opens the native file picker before loading the document", async () => {
  const blob = new Blob(["document contents"], { type: "text/plain" });
  let writtenBlob: Blob | undefined;
  let closed = false;
  let blobLoaded = false;

  const browserWindow = {
    isSecureContext: true,
    showSaveFilePicker: async (options?: { suggestedName?: string }) => {
      assert.equal(options?.suggestedName, "document.txt");
      assert.equal(blobLoaded, false);
      return {
        createWritable: async () => ({
          write: async (value: Blob) => {
            writtenBlob = value;
          },
          close: async () => {
            closed = true;
          },
        }),
      };
    },
  };

  const result = await downloadBlob(() => {
    blobLoaded = true;
    return blob;
  }, "document.txt", browserWindow);

  assert.equal(result, "picker");
  assert.equal(writtenBlob, blob);
  assert.equal(closed, true);
});

test("falls back to a browser download when the native file picker is unavailable", async () => {
  const anchor = {
    href: "",
    download: "",
    style: {} as Record<string, string>,
    click: () => {
      anchorWasClicked = true;
    },
    remove: () => {
      anchorWasRemoved = true;
    },
  };
  let anchorWasClicked = false;
  let anchorWasRemoved = false;
  let revokedUrl = "";

  const browserWindow = {
    isSecureContext: false,
    URL: {
      createObjectURL: () => "blob:document",
      revokeObjectURL: (url: string) => {
        revokedUrl = url;
      },
    },
    document: {
      createElement: (tagName: string) => {
        assert.equal(tagName, "a");
        return anchor;
      },
      body: {
        appendChild: (element: typeof anchor) => {
          assert.equal(element, anchor);
        },
      },
    },
  };

  const result = await downloadBlob(() => new Blob(["document contents"]), "document.txt", browserWindow);

  assert.equal(result, "download");
  assert.equal(anchor.href, "blob:document");
  assert.equal(anchor.download, "document.txt");
  assert.equal(anchorWasClicked, true);
  assert.equal(anchorWasRemoved, true);
  assert.equal(revokedUrl, "blob:document");
});
