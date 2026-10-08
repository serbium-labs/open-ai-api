import assert from "node:assert/strict";
import test from "node:test";

import {
  createRecordedAudioFile,
  detectRecordedAudioFormat,
  runComposerSubmission,
  selectRecorderMimeType,
} from "./index";

test("selectRecorderMimeType chooses the first format the browser can encode", () => {
  assert.equal(
    selectRecorderMimeType((mimeType: string) =>
      mimeType === "audio/ogg;codecs=opus"),
    "audio/ogg;codecs=opus",
  );
  assert.equal(selectRecorderMimeType(() => false), undefined);
});

test("recorded Ogg bytes get an Ogg MIME type and extension even when the chunk was mislabeled", async () => {
  const mislabeledChunk = new Blob(
    [new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 1, 2])],
    { type: "audio/webm" },
  );

  const format = await detectRecordedAudioFormat(mislabeledChunk);
  const { blob, file } = await createRecordedAudioFile(
    [mislabeledChunk],
    123,
  );

  assert.deepEqual(format, {
    extension: "ogg",
    mimeType: "audio/ogg",
  });
  assert.equal(blob.type, "audio/ogg");
  assert.equal(file.type, "audio/ogg");
  assert.equal(file.name, "voice-message-123.ogg");
});

test("recordings with unknown container bytes are rejected instead of renamed", async () => {
  await assert.rejects(
    createRecordedAudioFile([
      new Blob(["not an audio container"], {
        type: "audio/webm",
      }),
    ]),
    /unsupported audio format/i,
  );
});

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
