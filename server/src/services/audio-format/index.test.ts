import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  detectAudioFormat,
  inspectAudioUpload,
  looksLikeAudioUpload,
} from "./index";

test("inspectAudioUpload corrects a WebM-labeled Ogg upload from its bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audio-format-test-"));
  const path = join(directory, "upload");

  try {
    await writeFile(path, Buffer.from("OggS\0fixture", "latin1"));

    assert.deepEqual(
      await inspectAudioUpload(path, "voice-message.webm"),
      {
        extension: "ogg",
        mimeType: "audio/ogg",
        originalName: "voice-message.ogg",
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("detectAudioFormat recognizes recording and common upload containers", () => {
  const webm = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.from("doctypewebm", "ascii"),
  ]);
  const mp4 = Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);

  assert.equal(detectAudioFormat(webm)?.mimeType, "audio/webm");
  assert.equal(detectAudioFormat(mp4)?.mimeType, "audio/mp4");
  assert.equal(
    looksLikeAudioUpload("recording.ogg", "application/octet-stream"),
    true,
  );
});

test("inspectAudioUpload rejects a claimed audio file with incompatible bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audio-format-test-"));
  const path = join(directory, "upload");

  try {
    await writeFile(path, "plain text");
    await assert.rejects(
      inspectAudioUpload(path, "voice.webm"),
      /unsupported or invalid audio file/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
