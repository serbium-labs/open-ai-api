import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AudioTranscriptionService,
  runLocalCommand,
  type CommandRunner,
} from "./index";

test("transcribe converts audio and returns whisper.cpp output", async () => {
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "transcription-test-"),
  );
  const modelPath = join(fixtureDirectory, "model.bin");
  const inputPath = join(fixtureDirectory, "recording.ogg");
  const commands: Array<{ command: string; args: string[] }> = [];
  let generatedDirectory = "";

  await writeFile(modelPath, "model");
  await writeFile(inputPath, "OggSfixture", "latin1");

  const runCommand: CommandRunner = async (command, args) => {
    commands.push({ command, args });

    if (command === "ffmpeg-test") {
      const wavPath = args.at(-1);
      assert.ok(wavPath);
      generatedDirectory = join(wavPath, "..");
      await writeFile(wavPath, "wav");
      return;
    }

    const outputIndex = args.indexOf("-of");
    const outputPrefix = args[outputIndex + 1];
    assert.ok(outputPrefix);
    await writeFile(`${outputPrefix}.txt`, " What is in this repository? \n");
  };

  try {
    const service = new AudioTranscriptionService({
      ffmpegExecutable: "ffmpeg-test",
      maxFileSizeBytes: 1024,
      modelPath,
      runCommand,
      timeoutMs: 500,
      whisperExecutable: "whisper-test",
    });

    assert.equal(
      await service.transcribe({ path: inputPath, sizeBytes: 12 }),
      "What is in this repository?",
    );
    assert.equal(commands[0]?.command, "ffmpeg-test");
    assert.equal(commands[1]?.command, "whisper-test");
    await assert.rejects(access(generatedDirectory));
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});

test("transcribe reports a missing local model before running tools", async () => {
  let commandWasRun = false;
  const service = new AudioTranscriptionService({
    ffmpegExecutable: "ffmpeg",
    maxFileSizeBytes: 1024,
    modelPath: "/definitely/missing/ggml-model.bin",
    runCommand: async () => {
      commandWasRun = true;
    },
    timeoutMs: 500,
    whisperExecutable: "whisper-cli",
  });

  await assert.rejects(
    service.transcribe({ path: "/unused", sizeBytes: 12 }),
    /local Whisper model not found or unreadable/i,
  );
  assert.equal(commandWasRun, false);
});

test("transcribe rejects oversized files", async () => {
  const service = new AudioTranscriptionService({
    ffmpegExecutable: "ffmpeg",
    maxFileSizeBytes: 10,
    modelPath: "/unused",
    timeoutMs: 500,
    whisperExecutable: "whisper-cli",
  });

  await assert.rejects(
    service.transcribe({ path: "/unused", sizeBytes: 11 }),
    /audio file is too large/i,
  );
});

test("runLocalCommand gives a setup error for a missing executable", async () => {
  await assert.rejects(
    runLocalCommand(
      "definitely-missing-whisper-cli-for-test",
      [],
      500,
    ),
    /required local audio tool was not found/i,
  );
});
