import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UTF8_ENCODING } from "#constants";
import type { ServerConfig } from "#config";

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
  language: string;
  maxFileSizeBytes: number;
  modelPath: string;
  timeoutMs: number;
  whisperExecutable: string;
  runCommand?: CommandRunner;
};

const MAX_DIAGNOSTIC_LENGTH = 4_000;
const TERMINATION_GRACE_MS = 1_000;
const DEPENDENCY_PROBE_TIMEOUT_MS = 5_000;

export type AudioDependencyDiagnostic = {
  dependency: "FFmpeg" | "Whisper model" | "whisper.cpp";
  message: string;
};

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

async function assertReadableModel(modelPath: string): Promise<void> {
  try {
    await access(modelPath, constants.R_OK);
    const modelStats = await stat(modelPath);

    if (!modelStats.isFile()) {
      throw new Error("the configured path is not a file");
    }
  } catch (error: unknown) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(
      `Whisper model unavailable (WHISPER_MODEL_PATH="${modelPath}")${detail}. ` +
      "Download the model as described in README.md or correct WHISPER_MODEL_PATH in .env.",
    );
  }
}

function commandUnavailableMessage(
  dependency: "FFmpeg" | "whisper.cpp",
  environmentVariable: "FFMPEG_PATH" | "WHISPER_CPP_PATH",
  executable: string,
  error: unknown,
): string {
  const detail = error instanceof Error ? error.message : "unknown error";
  const instruction = dependency === "FFmpeg"
    ? "Install FFmpeg or correct FFMPEG_PATH in .env."
    : "Run the Stage 1 whisper.cpp setup script or correct WHISPER_CPP_PATH in .env.";

  return `${dependency} unavailable (${environmentVariable}="${executable}"): ${detail}. ${instruction}`;
}

export async function diagnoseAudioDependencies(
  dependencies: AudioTranscriptionServiceDependencies,
  runCommand: CommandRunner = runLocalCommand,
): Promise<AudioDependencyDiagnostic[]> {
  const checks = await Promise.all([
    runCommand(
      dependencies.ffmpegExecutable,
      ["-version"],
      DEPENDENCY_PROBE_TIMEOUT_MS,
    ).then<AudioDependencyDiagnostic | undefined>(
      () => undefined,
    ).catch((error: unknown): AudioDependencyDiagnostic => ({
      dependency: "FFmpeg",
      message: commandUnavailableMessage(
        "FFmpeg",
        "FFMPEG_PATH",
        dependencies.ffmpegExecutable,
        error,
      ),
    })),
    runCommand(
      dependencies.whisperExecutable,
      ["--help"],
      DEPENDENCY_PROBE_TIMEOUT_MS,
    ).then<AudioDependencyDiagnostic | undefined>(
      () => undefined,
    ).catch((error: unknown): AudioDependencyDiagnostic => ({
      dependency: "whisper.cpp",
      message: commandUnavailableMessage(
        "whisper.cpp",
        "WHISPER_CPP_PATH",
        dependencies.whisperExecutable,
        error,
      ),
    })),
    assertReadableModel(dependencies.modelPath).then<AudioDependencyDiagnostic | undefined>(
      () => undefined,
    ).catch((error: unknown): AudioDependencyDiagnostic => ({
      dependency: "Whisper model",
      message: error instanceof Error ? error.message : String(error),
    })),
  ]);

  return checks.filter(
    (diagnostic): diagnostic is AudioDependencyDiagnostic =>
      diagnostic !== undefined,
  );
}

export async function reportAudioDependencyDiagnostics(
  serverConfig: ServerConfig,
  diagnose: typeof diagnoseAudioDependencies = diagnoseAudioDependencies,
  warn: (message: string) => void = console.warn,
): Promise<void> {
  try {
    const diagnostics = await diagnose(serverConfig.audioTranscription);

    for (const diagnostic of diagnostics) {
      warn(
        `[audio] ${diagnostic.message} Text chat remains available; voice requests will fail until this dependency is fixed.`,
      );
    }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    warn(
      `[audio] Dependency diagnostics could not complete: ${detail}. ` +
      "Text chat remains available and audio dependencies will be checked again on each voice request.",
    );
  }
}

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

    await assertReadableModel(this.dependencies.modelPath);

    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "codex-audio-transcription-"),
    );
    const wavPath = join(temporaryDirectory, "normalized.wav");
    const outputPrefix = join(temporaryDirectory, "transcript");
    let cleanupIsSafe = true;

    try {
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
      } catch (error: unknown) {
        if (error instanceof LocalAudioCommandTimeoutError) {
          throw error;
        }

        throw new Error(commandUnavailableMessage(
          "FFmpeg",
          "FFMPEG_PATH",
          this.dependencies.ffmpegExecutable,
          error,
        ));
      }

      try {
        await this.runCommand(
          this.dependencies.whisperExecutable,
          [
            "-m",
            this.dependencies.modelPath,
            "-l",
            this.dependencies.language,
            "-f",
            wavPath,
            "-otxt",
            "-of",
            outputPrefix,
          ],
          this.dependencies.timeoutMs,
        );
      } catch (error: unknown) {
        if (error instanceof LocalAudioCommandTimeoutError) {
          throw error;
        }

        throw new Error(commandUnavailableMessage(
          "whisper.cpp",
          "WHISPER_CPP_PATH",
          this.dependencies.whisperExecutable,
          error,
        ));
      }

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
