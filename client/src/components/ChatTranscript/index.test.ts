import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPromptTurn,
  isSystemVoiceFilename,
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

test("isSystemVoiceFilename only identifies generated voice recording names", () => {
  assert.equal(isSystemVoiceFilename("voice-message-179231823782.webm"), true);
  assert.equal(isSystemVoiceFilename("voice-message-179231823782.ogg"), true);
  assert.equal(isSystemVoiceFilename("VOICE-MESSAGE-179231823782.M4A"), true);
  assert.equal(isSystemVoiceFilename("voice-message.webm"), false);
  assert.equal(isSystemVoiceFilename("meeting-recording.webm"), false);
  assert.equal(isSystemVoiceFilename("voice-message-179231823782.pdf"), false);
});
