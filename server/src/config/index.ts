import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_SERVER_PORT,
  RESPONSES_DIRECTORY_NAME,
  WORKSPACE_DIRECTORY_NAME,
} from "@/constants/index.js";

export type ServerConfig = {
  port: number;
  repositoryRoot: string;
  workspaceDirectory: string;
  responsesDirectory: string;
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
    workspaceDirectory: join(repositoryRoot, WORKSPACE_DIRECTORY_NAME),
    responsesDirectory: join(repositoryRoot, RESPONSES_DIRECTORY_NAME),
  };
}
