import assert from "node:assert/strict";
import test from "node:test";

import { runComposerSubmission } from "./index";

function deferredPromise(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolvePromise: () => void = () => undefined;
  let rejectPromise: (error: Error) => void = () => undefined;

  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

test("voice submission clears immediately and ignores a duplicate while pending", async () => {
  const pending = deferredPromise();
  const attachment = new File(["voice"], "voice.webm", {
    type: "audio/webm",
  });
  const lock = { current: false };
  const events: string[] = [];
  let submitCount = 0;

  const options = {
    lock,
    prompt: "",
    attachment,
    onSubmit: async (): Promise<void> => {
      submitCount += 1;
      events.push("submit");
      await pending.promise;
    },
    onStart: (): void => {
      events.push("clear-preview");
    },
    onSuccess: (): void => {
      events.push("success");
    },
    onFailure: (): void => {
      events.push("restore-preview");
    },
    onFinish: (): void => {
      events.push("finish");
    },
  };

  const firstSubmission = runComposerSubmission(options);
  const duplicateSubmission = runComposerSubmission(options);

  assert.deepEqual(events, ["clear-preview", "submit"]);
  assert.equal(submitCount, 1);
  assert.equal(lock.current, true);

  pending.resolve();
  await Promise.all([firstSubmission, duplicateSubmission]);

  assert.deepEqual(events, [
    "clear-preview",
    "submit",
    "success",
    "finish",
  ]);
  assert.equal(lock.current, false);
});

test("failed voice submission restores the recording for retry", async () => {
  const pending = deferredPromise();
  const lock = { current: false };
  const events: string[] = [];

  const submission = runComposerSubmission({
    lock,
    prompt: "",
    attachment: new File(["voice"], "voice.webm", {
      type: "audio/webm",
    }),
    onSubmit: () => pending.promise,
    onStart: () => events.push("clear-preview"),
    onSuccess: () => events.push("success"),
    onFailure: () => events.push("restore-preview"),
    onFinish: () => events.push("finish"),
  });

  assert.deepEqual(events, ["clear-preview"]);

  pending.reject(new Error("Upload failed"));
  await submission;

  assert.deepEqual(events, [
    "clear-preview",
    "restore-preview",
    "finish",
  ]);
  assert.equal(lock.current, false);
});
