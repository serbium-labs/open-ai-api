import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type UserConfig } from "vite";

const DEFAULT_SERVER_PORT = 3001;
const DEFAULT_CLIENT_PORT = 5173;
const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));

function readPort(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    value.trim() === "" ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 65_535
  ) {
    throw new Error(
      `Invalid ${name} value "${value}": expected an integer from 1 to 65535.`,
    );
  }

  return parsed;
}

export function resolveVitePorts(environment: Record<string, string | undefined>): {
  clientPort: number;
  serverPort: number;
} {
  const serverPortName = environment.SERVER_PORT !== undefined
    ? "SERVER_PORT"
    : environment.PORT !== undefined
      ? "PORT"
      : "SERVER_PORT";

  return {
    clientPort: readPort(
      "CLIENT_PORT",
      environment.CLIENT_PORT,
      DEFAULT_CLIENT_PORT,
    ),
    serverPort: readPort(
      serverPortName,
      environment.SERVER_PORT ?? environment.PORT,
      DEFAULT_SERVER_PORT,
    ),
  };
}

export function createViteConfig(
  environment: Record<string, string | undefined>,
): UserConfig {
  const ports = resolveVitePorts(environment);

  return {
    envDir: REPOSITORY_ROOT,
    plugins: [react()],
    resolve: {
      alias: {
        "@components": fileURLToPath(new URL("./src/components", import.meta.url)),
        "@api": fileURLToPath(new URL("./src/api", import.meta.url)),
        "@constants": fileURLToPath(new URL("./src/constants", import.meta.url)),
        "@models": fileURLToPath(new URL("./src/types", import.meta.url)),
      },
    },
    server: {
      port: ports.clientPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://localhost:${ports.serverPort}`,
          changeOrigin: true,
          configure(proxy) {
            proxy.on("error", (_error, _request, response) => {
              if (response.headersSent || response.writableEnded) {
                return;
              }

              response
                .writeHead(503, { "Content-Type": "application/json" })
                .end(JSON.stringify({ error: "Server is starting..." }));
            });
          },
        },
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const fileEnvironment = loadEnv(mode, REPOSITORY_ROOT, "");

  return createViteConfig({ ...fileEnvironment, ...process.env });
});
