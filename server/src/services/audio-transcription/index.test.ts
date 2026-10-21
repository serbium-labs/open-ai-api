import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  AudioTranscriptionService,
  LocalAudioCommandTimeoutError,
  runLocalCommand,
  type CommandRunner,
} from "./index";

test("transcribe converts audio and returns whisper.cpp output", async () => {
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "transcription test with spaces-"),
  );
  const modelPath = join(fixtureDirectory, "model.bin");
  const inputPath = join(fixtureDirectory, "recording.ogg");
  const commands: Array<{ command: string; args: string[] }> = [];
  let generatedDirectory = "";

  await writeFile(modelPath, "model");
  await writeFile(inputPath, "OggSfixture", "latin1");

  const runCommand: CommandRunner = async (command, args) => {
    commands.push({ command, args });

    if (commands.length === 1) {
      const wavPath = args.at(-1);
      assert.ok(wavPath);
      generatedDirectory = dirname(wavPath);
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
      ffmpegExecutable: "C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe",
      maxFileSizeBytes: 1024,
      modelPath,
      runCommand,
      timeoutMs: 500,
      whisperExecutable:
        "C:\\Program Files\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe",
    });

    assert.equal(
      await service.transcribe({ path: inputPath, sizeBytes: 12 }),
      "What is in this repository?",
    );
    assert.equal(
      commands[0]?.command,
      "C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe",
    );
    assert.deepEqual(commands[0]?.args.slice(0, -1), [
      "-v",
      "error",
      "-nostdin",
      "-y",
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
    ]);
    assert.match(commands[0]?.args.at(-1) ?? "", /normalized\.wav$/);
    assert.equal(
      commands[1]?.command,
      "C:\\Program Files\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe",
    );
    assert.deepEqual(commands[1]?.args, [
      "-m",
      modelPath,
      "-l",
      "auto",
      "-f",
      commands[0]?.args.at(-1),
      "-otxt",
      "-of",
      join(generatedDirectory, "transcript"),
    ]);
    assert.match(commands[1]?.args.at(-1) ?? "", /transcript$/);
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

test("a timed-out command closes before transcription temporary files are removed", async () => {
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "transcription timeout test-"),
  );
  const modelPath = join(fixtureDirectory, "Whisper Models", "ggml-base.bin");
  await mkdir(join(fixtureDirectory, "Whisper Models"));
  await writeFile(modelPath, "model");

  const child = new EventEmitter() as EventEmitter & {
    stderr: PassThrough;
    kill(signal?: NodeJS.Signals): boolean;
  };
  child.stderr = new PassThrough();
  let killSignal: NodeJS.Signals | undefined;
  child.kill = (signal?: NodeJS.Signals): boolean => {
    killSignal = signal;
    return true;
  };
  const spawnCommand = (() => child) as unknown as typeof spawn;
  let temporaryDirectory = "";

  const service = new AudioTranscriptionService({
    ffmpegExecutable: "C:\\Audio Tools\\ffmpeg.exe",
    maxFileSizeBytes: 1024,
    modelPath,
    runCommand: async (command, args, timeoutMs) => {
      temporaryDirectory = dirname(args.at(-1) ?? "");
      await runLocalCommand(command, args, timeoutMs, spawnCommand);
    },
    timeoutMs: 5,
    whisperExecutable: "C:\\Audio Tools\\whisper-cli.exe",
  });
  const transcription = service.transcribe({
    path: join(fixtureDirectory, "input recording.ogg"),
    sizeBytes: 12,
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(killSignal, "SIGKILL");
    await access(temporaryDirectory);

    let rejected = false;
    void transcription.catch(() => {
      rejected = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(rejected, false);

    child.emit("close", null, "SIGKILL");
    await assert.rejects(transcription, (error: unknown) => {
      assert.ok(error instanceof LocalAudioCommandTimeoutError);
      assert.equal(error.terminationConfirmed, true);
      assert.match(error.message, /timed out after 5 ms/i);
      return true;
    });
    await assert.rejects(access(temporaryDirectory));
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});

test("a timed-out command retains temporary files when kill returns false without close", async () => {
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "transcription unconfirmed timeout test-"),
  );
  const modelPath = join(fixtureDirectory, "model.bin");
  await writeFile(modelPath, "model");

  const child = new EventEmitter() as EventEmitter & {
    stderr: PassThrough;
    kill(signal?: NodeJS.Signals): boolean;
  };
  child.stderr = new PassThrough();
  child.kill = (): boolean => false;
  const spawnCommand = (() => child) as unknown as typeof spawn;
  let temporaryDirectory = "";
  let guardTimer: NodeJS.Timeout | undefined;

  const service = new AudioTranscriptionService({
    ffmpegExecutable: "unresponsive-tool",
    maxFileSizeBytes: 1024,
    modelPath,
    runCommand: async (command, args, timeoutMs) => {
      temporaryDirectory = dirname(args.at(-1) ?? "");
      await runLocalCommand(command, args, timeoutMs, spawnCommand);
    },
    timeoutMs: 5,
    whisperExecutable: "unused-whisper",
  });

  try {
    await assert.rejects(
      Promise.race([
        service.transcribe({
          path: join(fixtureDirectory, "input.ogg"),
          sizeBytes: 12,
        }),
        new Promise<never>((_resolve, reject) => {
          guardTimer = setTimeout(
            () => reject(new Error("timeout handling hung")),
            2_000,
          );
        }),
      ]),
      (error: unknown) => {
        assert.ok(error instanceof LocalAudioCommandTimeoutError);
        assert.equal(error.terminationConfirmed, false);
        assert.match(error.message, /timed out after 5 ms: unresponsive-tool/i);
        return true;
      },
    );
    await access(temporaryDirectory);

    assert.doesNotThrow(() => {
      child.emit("error", new Error("late child error"));
      child.emit("error", new Error("repeated late child error"));
      child.emit("close", null, "SIGKILL");
      child.emit("close", null, "SIGKILL");
    });
  } finally {
    if (guardTimer !== undefined) {
      clearTimeout(guardTimer);
    }
    await rm(fixtureDirectory, { recursive: true, force: true });
    if (temporaryDirectory !== "") {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
});

test("a timed-out command retains temporary files when kill throws without close", async () => {
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "transcription throwing kill test-"),
  );
  const modelPath = join(fixtureDirectory, "model.bin");
  await writeFile(modelPath, "model");

  const child = new EventEmitter() as EventEmitter & {
    stderr: PassThrough;
    kill(signal?: NodeJS.Signals): boolean;
  };
  child.stderr = new PassThrough();
  child.kill = (): boolean => {
    throw new Error("kill failed");
  };
  const spawnCommand = (() => child) as unknown as typeof spawn;
  let temporaryDirectory = "";
  let guardTimer: NodeJS.Timeout | undefined;

  const service = new AudioTranscriptionService({
    ffmpegExecutable: "unresponsive-tool",
    maxFileSizeBytes: 1024,
    modelPath,
    runCommand: async (command, args, timeoutMs) => {
      temporaryDirectory = dirname(args.at(-1) ?? "");
      await runLocalCommand(command, args, timeoutMs, spawnCommand);
    },
    timeoutMs: 5,
    whisperExecutable: "unused-whisper",
  });

  try {
    await assert.rejects(
      Promise.race([
        service.transcribe({
          path: join(fixtureDirectory, "input.ogg"),
          sizeBytes: 12,
        }),
        new Promise<never>((_resolve, reject) => {
          guardTimer = setTimeout(
            () => reject(new Error("timeout handling hung")),
            2_000,
          );
        }),
      ]),
      (error: unknown) => {
        assert.ok(error instanceof LocalAudioCommandTimeoutError);
        assert.equal(error.terminationConfirmed, false);
        return true;
      },
    );
    await access(temporaryDirectory);
  } finally {
    if (guardTimer !== undefined) {
      clearTimeout(guardTimer);
    }
    await rm(fixtureDirectory, { recursive: true, force: true });
    if (temporaryDirectory !== "") {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
});
