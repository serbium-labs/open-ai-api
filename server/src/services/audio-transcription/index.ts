import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UTF8_ENCODING } from "#constants";

export type AudioTranscriptionRequest = {
  path: string;
  sizeBytes: number;
};

export type AudioTranscriber = {
  transcribe(request: AudioTranscriptionRequest): Promise<string>;
};

export type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
) => Promise<void>;

export type AudioTranscriptionServiceDependencies = {
  ffmpegExecutable: string;
  maxFileSizeBytes: number;
  modelPath: string;
  timeoutMs: number;
  whisperExecutable: string;
  runCommand?: CommandRunner;
};

const MAX_DIAGNOSTIC_LENGTH = 4_000;
const TERMINATION_GRACE_MS = 1_000;

export class LocalAudioCommandTimeoutError extends Error {
  public constructor(
    command: string,
    timeoutMs: number,
    public readonly terminationConfirmed: boolean,
  ) {
    super(`Local audio command timed out after ${timeoutMs} ms: ${command}`);
    this.name = "LocalAudioCommandTimeoutError";
  }
}

export const runLocalCommand = (
  command: string,
  args: string[],
  timeoutMs: number,
  spawnCommand: typeof spawn = spawn,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const child = spawnCommand(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let diagnostic = "";
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout;
    let terminationTimer: NodeJS.Timeout | undefined;

    const clearTimers = (): void => {
      clearTimeout(timer);

      if (terminationTimer !== undefined) {
        clearTimeout(terminationTimer);
      }
    };

    const rejectTimeout = (terminationConfirmed: boolean): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimers();
      reject(new LocalAudioCommandTimeoutError(
        command,
        timeoutMs,
        terminationConfirmed,
      ));
    };

    child.stderr.setEncoding(UTF8_ENCODING);
    child.stderr.on("data", (chunk: string) => {
      diagnostic = `${diagnostic}${chunk}`.slice(
        -MAX_DIAGNOSTIC_LENGTH,
      );
    });

    timer = setTimeout(() => {
      if (settled) {
        return;
      }

      timedOut = true;
      terminationTimer = setTimeout(
        () => rejectTimeout(false),
        TERMINATION_GRACE_MS,
      );

      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs);

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) {
        return;
      }

      if (timedOut) {
        return;
      }

      settled = true;
      clearTimers();
      reject(
        error.code === "ENOENT"
          ? new Error(
              `Required local audio tool was not found: ${command}. See README.md for installation steps.`,
            )
          : error,
      );
    });

    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) {
        return;
      }

      if (timedOut) {
        rejectTimeout(true);
        return;
      }

      settled = true;
      clearTimers();

      if (code === 0) {
        resolve();
        return;
      }

      const detail = diagnostic.trim();
      reject(new Error(
        `Local audio command failed (${command}, exit ${code ?? signal ?? "unknown"})${
          detail === "" ? "" : `: ${detail}`
        }`,
      ));
    });
  });

export class AudioTranscriptionService implements AudioTranscriber {
  private readonly runCommand: CommandRunner;

  public constructor(
    private readonly dependencies: AudioTranscriptionServiceDependencies,
  ) {
    this.runCommand = dependencies.runCommand ?? runLocalCommand;
  }

  public async transcribe({
    path,
    sizeBytes,
  }: AudioTranscriptionRequest): Promise<string> {
    if (sizeBytes > this.dependencies.maxFileSizeBytes) {
      throw new Error(
        `Audio file is too large. The limit is ${this.dependencies.maxFileSizeBytes} bytes.`,
      );
    }

    try {
      await access(this.dependencies.modelPath, constants.R_OK);
    } catch {
      throw new Error(
        `Local Whisper model not found or unreadable: ${this.dependencies.modelPath}. See README.md for setup instructions.`,
      );
    }

    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "codex-audio-transcription-"),
    );
    const wavPath = join(temporaryDirectory, "normalized.wav");
    const outputPrefix = join(temporaryDirectory, "transcript");
    let cleanupIsSafe = true;

    try {
      await this.runCommand(
        this.dependencies.ffmpegExecutable,
        [
          "-v",
          "error",
          "-nostdin",
          "-y",
          "-i",
          path,
          "-ar",
          "16000",
          "-ac",
          "1",
          "-c:a",
          "pcm_s16le",
          wavPath,
        ],
        this.dependencies.timeoutMs,
      );

      await this.runCommand(
        this.dependencies.whisperExecutable,
        [
          "-m",
          this.dependencies.modelPath,
          "-l",
          "auto",
          "-f",
          wavPath,
          "-otxt",
          "-of",
          outputPrefix,
        ],
        this.dependencies.timeoutMs,
      );

      let transcript: string;

      try {
        transcript = (
          await readFile(`${outputPrefix}.txt`, UTF8_ENCODING)
        ).trim();
      } catch (error: unknown) {
        const code = error instanceof Error && "code" in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;

        if (code === "ENOENT") {
          throw new Error(
            "whisper.cpp completed without producing a transcript file.",
          );
        }

        throw error;
      }

      if (transcript === "") {
        throw new Error(
          "Local transcription completed but no speech was detected.",
        );
      }

      return transcript;
    } catch (error: unknown) {
      if (
        error instanceof LocalAudioCommandTimeoutError &&
        !error.terminationConfirmed
      ) {
        cleanupIsSafe = false;
      }

      throw error;
    } finally {
      if (cleanupIsSafe) {
        await rm(temporaryDirectory, {
          recursive: true,
          force: true,
        }).catch(() => {});
      }
    }
  }
}
