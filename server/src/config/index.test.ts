import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createServerConfig } from "./index";

test("audio tool configuration preserves Windows paths containing spaces", () => {
  const whisperExecutable =
    "C:\\Program Files\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe";
  const ffmpegExecutable = "C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe";
  const modelPath = "C:\\Whisper Models\\ggml-base.bin";
  const config = createServerConfig({
    FFMPEG_PATH: `  ${ffmpegExecutable}  `,
    WHISPER_CPP_PATH: `  ${whisperExecutable}  `,
    WHISPER_MODEL_PATH: `  ${modelPath}  `,
  });

  assert.equal(config.audioTranscription.ffmpegExecutable, ffmpegExecutable);
  assert.equal(config.audioTranscription.whisperExecutable, whisperExecutable);
  assert.equal(
    config.audioTranscription.modelPath,
    resolve(config.repositoryRoot, modelPath),
  );
});

test("audio tool configuration retains PATH-based defaults", () => {
  const config = createServerConfig({});

  assert.equal(config.audioTranscription.ffmpegExecutable, "ffmpeg");
  assert.equal(config.audioTranscription.whisperExecutable, "whisper-cli");
  assert.equal(
    config.audioTranscription.modelPath,
    resolve(config.repositoryRoot, "models/ggml-base.bin"),
  );
});
