import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("raises active prompt tooltips above the chat transcript", async () => {
  const stylesheet = await readFile(new URL("./tooltips.css", import.meta.url), "utf8");

  assert.match(
    stylesheet,
    /:where\(\.prompt-form \[data-tooltip\]\):is\(:hover, :focus-visible\)\s*{\s*z-index: var\(--tooltip-z-index\);\s*}/,
  );
});
