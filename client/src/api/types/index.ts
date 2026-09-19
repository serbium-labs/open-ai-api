import type { CodeFile } from "@models";

export type CodeFilesResponse = {
  files: CodeFile[];
};

export type CodexSuccessResponse = {
  finalResponse: string;
};

export type ErrorResponse = {
  error: string;
};
