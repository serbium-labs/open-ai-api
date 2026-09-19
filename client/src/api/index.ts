import type { CodexSuccessResponse, CodeFilesResponse, ErrorResponse } from "@api/types";
import type { CodeFile } from "@models";

async function readJsonResponse<TSuccess extends object>(response: Response): Promise<TSuccess> {
  const body: TSuccess | ErrorResponse = (await response.json()) as TSuccess | ErrorResponse;

  if (!response.ok) {
    const errorMessage: string = "error" in body ? body.error : "Request failed";
    throw new Error(errorMessage);
  }

  return body as TSuccess;
}

export async function fetchCodeFiles(fetchImpl: typeof fetch = fetch): Promise<CodeFile[]> {
  const response: Response = await fetchImpl("/api/code");
  const body: CodeFilesResponse = await readJsonResponse<CodeFilesResponse>(response);
  return body.files;
}

export async function submitPrompt(
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response: Response = await fetchImpl("/api/codex", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
  const body: CodexSuccessResponse = await readJsonResponse<CodexSuccessResponse>(response);
  return body.finalResponse;
}

export type SubmitAndRefreshOptions = {
  fetchImpl?: typeof fetch;
  onFinalResponse?: (finalResponse: string) => void;
  onCodeFiles?: (files: CodeFile[]) => void;
};

export type SubmitAndRefreshResult = {
  finalResponse: string;
  files: CodeFile[];
};

export async function submitAndRefresh(
  prompt: string,
  {
    fetchImpl = fetch,
    onFinalResponse = () => undefined,
    onCodeFiles = () => undefined,
  }: SubmitAndRefreshOptions = {},
): Promise<SubmitAndRefreshResult> {
  const finalResponse: string = await submitPrompt(prompt, fetchImpl);
  onFinalResponse(finalResponse);

  const files: CodeFile[] = await fetchCodeFiles(fetchImpl);
  onCodeFiles(files);

  return { finalResponse, files };
}
