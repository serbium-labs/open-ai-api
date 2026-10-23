import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the active prompt above messages with an opaque boundary", async () => {
  const stylesheet = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(
    stylesheet,
    /\.prompt-form\s*{[^}]*position: relative;[^}]*z-index: 1;[^}]*isolation: isolate;/s,
  );
  assert.match(
    stylesheet,
    /\.chat-column-active \.prompt-form::before\s*{[^}]*inset: -16px 0 -12px;[^}]*z-index: -1;[^}]*background: var\(--color-page\);/s,
  );
  assert.doesNotMatch(
    stylesheet,
    /\.chat-transcript\s*{[^}]*z-index:/s,
  );
});
