export const DEFAULT_SERVER_PORT: number = 3001;
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
