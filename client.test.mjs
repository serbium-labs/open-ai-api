import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { fetchCodeFiles, submitAndRefresh } from "./client.mjs";

function jsonResponse(body, { ok = true } = {}) {
  return {
    ok,
    json: async () => body,
  };
}

test("fetchCodeFiles loads the initial workspace snapshot", async () => {
  const calls = [];
  const files = [{ path: "main.js", content: "export default 1;" }];

  const result = await fetchCodeFiles(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ files });
  });

  assert.deepEqual(result, files);
  assert.deepEqual(calls, [{ url: "/api/code", options: undefined }]);
});

test("submitAndRefresh refreshes code only after a successful edit", async () => {
  const events = [];
  const files = [{ path: "main.js", content: "export default 2;" }];
  const fetchImpl = async (url) => {
    events.push(url);

    if (url === "/api/codex") {
      return jsonResponse({ finalResponse: "Updated main.js" });
    }

    return jsonResponse({ files });
  };

  const result = await submitAndRefresh("Change the value", {
    fetchImpl,
    onFinalResponse: (response) => events.push(`response:${response}`),
    onCodeFiles: (updatedFiles) => events.push(`files:${updatedFiles.length}`),
  });

  assert.deepEqual(result, { finalResponse: "Updated main.js", files });
  assert.deepEqual(events, [
    "/api/codex",
    "response:Updated main.js",
    "/api/code",
    "files:1",
  ]);
});

test("submitAndRefresh retains the prior code view when the edit request fails", async () => {
  const events = [];
  const fetchImpl = async (url) => {
    events.push(url);
    return jsonResponse({ error: "Codex failed" }, { ok: false });
  };

  await assert.rejects(
    submitAndRefresh("Break", {
      fetchImpl,
      onFinalResponse: () => events.push("response"),
      onCodeFiles: () => events.push("files"),
    }),
    /Codex failed/,
  );

  assert.deepEqual(events, ["/api/codex"]);
});

test("the browser page includes a text-only Code to edit view", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");

  assert.match(html, /<h2 id="code-to-edit-title">Code to edit<\/h2>/);
  assert.match(html, /contents\.textContent = file\.content/);
  assert.match(html, /await loadCode\(\)/);
  assert.doesNotMatch(html, /innerHTML/);
});
