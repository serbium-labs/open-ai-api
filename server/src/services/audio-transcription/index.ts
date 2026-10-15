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

export const runLocalCommand: CommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let diagnostic = "";
    let settled = false;

    child.stderr.setEncoding(UTF8_ENCODING);
    child.stderr.on("data", (chunk: string) => {
      diagnostic = `${diagnostic}${chunk}`.slice(
        -MAX_DIAGNOSTIC_LENGTH,
      );
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGKILL");
      reject(new Error(
        `Local audio command timed out after ${timeoutMs} ms: ${command}`,
      ));
    }, timeoutMs);

    child.once("error", (error: NodeJS.ErrnoException) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
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

      settled = true;
      clearTimeout(timer);

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
    } finally {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      }).catch(() => {});
    }
  }
}
