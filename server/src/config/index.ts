import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    maxFileSizeBytes: number;
    modelPath: string;
    timeoutMs: number;
    whisperExecutable: string;
  };
};

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_SERVER_PORT;
  }

  const parsedPort: number = Number(value);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    return DEFAULT_SERVER_PORT;
  }

  return parsedPort;
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

export function createServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const repositoryRoot: string = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

  return {
    port: readPort(environment.PORT),
    repositoryRoot,
    chatArchiveDirectory: join(repositoryRoot, CHAT_ARCHIVE_DIRECTORY_NAME),
    codexModel: CODEX_MODEL,
    audioTranscription: {
      ffmpegExecutable: environment.FFMPEG_PATH?.trim() || "ffmpeg",
      maxFileSizeBytes: 20 * 1024 * 1024,
      modelPath: resolve(
        repositoryRoot,
        environment.WHISPER_MODEL_PATH?.trim() ||
          "models/ggml-base.bin",
      ),
      timeoutMs: readPositiveInteger(
        environment.AUDIO_TRANSCRIPTION_TIMEOUT_MS,
        120_000,
      ),
      whisperExecutable:
        environment.WHISPER_CPP_PATH?.trim() || "whisper-cli",
    },
  };
}
