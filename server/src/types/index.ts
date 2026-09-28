import type { RequestHandler } from "express";

export type CodeFile = {
  path: string;
  content: string;
};

export type ChatRole = "user" | "assistant";

export type ChatResource = CodeFile & {
  id: string;
  messageId: string;
  language: string | undefined;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  resources: string[];
};

export type ChatSummary = {
  codexThreadId?: string;
  id: string;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatDetail = ChatSummary & {
  messages: ChatMessage[];
  resources: ChatResource[];
};

export type ChatPromptRequestBody = {
  prompt?: unknown;
};

export type CodexRequestBody = ChatPromptRequestBody;

export type ChatRenameRequestBody = {
  title?: unknown;
};

export type ChatCreateRequestBody = {
  title?: unknown;
};

export type ChatListResponse = {
  chats: ChatSummary[];
};

export type ChatDetailResponse = {
  chat: ChatDetail;
};

export type ChatPromptResponse = {
  chat: ChatDetail;
  finalResponse: string;
};

export type CodexSuccessResponse = {
  finalResponse: string;
};

export type CodeFilesResponse = {
  files: CodeFile[];
};

export type ErrorResponse = {
  error: string;
};

export type AsyncRouteHandler = RequestHandler;
