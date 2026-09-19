export const DEFAULT_SERVER_PORT: number = 3001;
export const CODEX_SANDBOX_MODE: "workspace-write" = "workspace-write";
export const UTF8_ENCODING: BufferEncoding = "utf8";
export const MARKDOWN_EXTENSION: string = ".md";
export const WORKSPACE_DIRECTORY_NAME: string = "code-block-responses";
export const RESPONSES_DIRECTORY_NAME: string = "responses";
export const API_ROUTES = {
  codex: "/api/codex",
  code: "/api/code",
} as const;
export const HTTP_STATUS = {
  ok: 200,
  badRequest: 400,
  internalServerError: 500,
} as const;
