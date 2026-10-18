import assert from "node:assert/strict";
import test from "node:test";

import { advanceComposerSessionId } from "./composerSession";

test("conversation navigation gives the prompt form a new session", () => {
  const currentSessionId = 4;

  assert.notEqual(
    advanceComposerSessionId(currentSessionId),
    currentSessionId,
  );
});

test("a late result from the previous prompt form cannot target the new session", async () => {
  let activeSessionId = 7;
  const attachmentSessionId = activeSessionId;
  let applyLateAttachment = false;

  const lateAttachment = Promise.resolve().then(() => {
    if (attachmentSessionId === activeSessionId) {
      applyLateAttachment = true;
    }
  });

  activeSessionId = advanceComposerSessionId(activeSessionId);
  await lateAttachment;

  assert.equal(applyLateAttachment, false);
});
