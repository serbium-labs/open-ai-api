import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPromptTurn,
  type ChatMessageAttachment,
} from "./index";

test("appendPromptTurn puts the user attachment before the pending assistant", () => {
  const attachment: ChatMessageAttachment = {
    name: "voice-message.webm",
    mimeType: "audio/webm",
    path: "",
    previewUrl: "blob:voice-preview",
  };

  const result = appendPromptTurn([], "", [attachment]);

  assert.equal(result.messages.length, 2);
  assert.deepEqual(result.messages[0]?.attachments, [attachment]);
  assert.equal(result.messages[0]?.role, "user");
  assert.equal(result.messages[1]?.role, "assistant");
  assert.equal(result.messages[1]?.status, "pending");
});
