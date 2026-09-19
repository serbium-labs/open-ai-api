import type { CodeFile } from "@/types/index.js";

export type CodeFilesResponse = {
  files: CodeFile[];
};

export type CodexSuccessResponse = {
  finalResponse: string;
};

export type ErrorResponse = {
  error: string;
};
