import type { RequestHandler } from "express";

export type CodeFile = {
  path: string;
  content: string;
};

export type CodexRequestBody = {
  prompt?: unknown;
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
