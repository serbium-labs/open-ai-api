import { existsSync } from "node:fs";
import { isAbsolute, join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotEnv } from "dotenv";

import {
  CHAT_ARCHIVE_DIRECTORY_NAME,
  CODEX_MODEL,
  DEFAULT_SERVER_PORT,
} from "#constants";

export type ServerConfig = {
  port: number;
  repositoryRoot: string;
  chatArchiveDirectory: string;
  codexModel: string;
  audioTranscription: {
    ffmpegExecutable: string;
    language: string;
    maxFileSizeBytes: number;
    modelPath: string;
    timeoutMs: number;
    whisperExecutable: string;
  };
};

export type RuntimePlatform = {
  arch: NodeJS.Architecture;
  exists: (path: string) => boolean;
  platform: NodeJS.Platform;
};

const DEFAULT_RUNTIME_PLATFORM: RuntimePlatform = {
  arch: process.arch,
  exists: existsSync,
  platform: process.platform,
};

export function getRepositoryRoot(): string {
  return resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

export function loadRootEnvironment(
  repositoryRoot: string = getRepositoryRoot(),
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const environmentFilePath = join(repositoryRoot, ".env");

  if (!existsSync(environmentFilePath)) {
    throw new Error(
      `Missing required environment file: ${environmentFilePath}. ` +
        "Copy .env.example to .env and review its values before starting the server.",
    );
  }

  const result = loadDotEnv({
    path: environmentFilePath,
    processEnv: environment as Record<string, string>,
    override: false,
  });

  if (result.error !== undefined) {
    throw new Error(
      `Failed to load environment file: ${environmentFilePath}. ${result.error.message}`,
      { cause: result.error },
    );
  }
}

function readPort(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsedPort: number = Number(value);

  if (
    value.trim() === "" ||
    !Number.isInteger(parsedPort) ||
    parsedPort < 1 ||
    parsedPort > 65_535
  ) {
    throw new Error(
      `Invalid ${name} value "${value}": expected an integer from 1 to 65535.`,
    );
  }

  return parsedPort;
}

function isCommandName(value: string): boolean {
  return !value.includes("/") && !value.includes("\\") && !isAbsolute(value);
}

function resolveExecutablePath(value: string, repositoryRoot: string): string {
  if (isCommandName(value) || isAbsolute(value) || win32.isAbsolute(value)) {
    return value;
  }

  return resolve(repositoryRoot, value);
}

function resolveProjectPath(value: string, repositoryRoot: string): string {
  return isAbsolute(value) || win32.isAbsolute(value)
    ? value
    : resolve(repositoryRoot, value);
}

function discoverWhisperExecutable(
  repositoryRoot: string,
  runtime: RuntimePlatform,
): string {
  const candidates: string[] = runtime.platform === "win32"
    ? runtime.arch === "arm64"
      ? [
          ".local/whisper.cpp/build-arm64/bin/Release/whisper-cli.exe",
          ".local/whisper.cpp/build-x64/bin/Release/whisper-cli.exe",
        ]
      : [
          ".local/whisper.cpp/build-x64/bin/Release/whisper-cli.exe",
        ]
    : [".local/whisper.cpp/build/bin/whisper-cli"];

  for (const candidate of candidates) {
    const absoluteCandidate = resolve(repositoryRoot, candidate);

    if (runtime.exists(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }

  return runtime.platform === "win32"
    ? "whisper-cli.exe"
    : "whisper-cli";
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed: number = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

export function createServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
  runtime: RuntimePlatform = DEFAULT_RUNTIME_PLATFORM,
): ServerConfig {
  const repositoryRoot: string = getRepositoryRoot();
  const explicitWhisperPath = environment.WHISPER_CPP_PATH?.trim();
  const serverPortName = environment.SERVER_PORT !== undefined
    ? "SERVER_PORT"
    : environment.PORT !== undefined
      ? "PORT"
      : "SERVER_PORT";
  const serverPortValue = environment.SERVER_PORT !== undefined
    ? environment.SERVER_PORT
    : environment.PORT;

  return {
    port: readPort(serverPortName, serverPortValue, DEFAULT_SERVER_PORT),
    repositoryRoot,
    chatArchiveDirectory: join(repositoryRoot, CHAT_ARCHIVE_DIRECTORY_NAME),
    codexModel: CODEX_MODEL,
    audioTranscription: {
      ffmpegExecutable: resolveExecutablePath(
        environment.FFMPEG_PATH?.trim() || "ffmpeg",
        repositoryRoot,
      ),
      language: environment.WHISPER_LANGUAGE?.trim().toLowerCase() || "auto",
      maxFileSizeBytes: 20 * 1024 * 1024,
      modelPath: resolveProjectPath(
        environment.WHISPER_MODEL_PATH?.trim() || "models/ggml-base.bin",
        repositoryRoot,
      ),
      timeoutMs: readPositiveInteger(
        environment.AUDIO_TRANSCRIPTION_TIMEOUT_MS,
        120_000,
      ),
      whisperExecutable:
        explicitWhisperPath === undefined || explicitWhisperPath === ""
          ? discoverWhisperExecutable(repositoryRoot, runtime)
          : resolveExecutablePath(explicitWhisperPath, repositoryRoot),
    },
  };
}
