export const DEFAULT_SERVER_PORT: number = 3001;
// Common Codex-capable model values: gpt-5, gpt-5.1, gpt-5.2, gpt-5.3-codex, gpt-5.4, gpt-5.5, gpt-5.6, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-6-astra.
export const CODEX_MODEL: string = "gpt-5.6-terra";
export const CODEX_SANDBOX_MODE: "workspace-write" = "workspace-write";
export const UTF8_ENCODING: BufferEncoding = "utf8";
export const MARKDOWN_EXTENSION: string = ".md";
export const CHAT_ARCHIVE_DIRECTORY_NAME: string = "chats";
export const API_ROUTES = {
  chats: "/api/chats",
} as const;
export const HTTP_STATUS = {
  ok: 200,
  badRequest: 400,
  notFound: 404,
  internalServerError: 500,
} as const;
