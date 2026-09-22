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

export function createServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const repositoryRoot: string = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

  return {
    port: readPort(environment.PORT),
    repositoryRoot,
    chatArchiveDirectory: join(repositoryRoot, CHAT_ARCHIVE_DIRECTORY_NAME),
    codexModel: CODEX_MODEL,
  };
}
