import type { ChatDetailResponse, ChatListResponse, ChatPromptResponse, ErrorResponse } from "@api/types";
import type { ChatDetail, ChatSummary } from "@models";

async function readJsonResponse<TSuccess extends object>(response: Response): Promise<TSuccess> {
  const body: TSuccess | ErrorResponse = (await response.json()) as TSuccess | ErrorResponse;

  if (!response.ok) {
    const errorMessage: string = "error" in body ? body.error : "Request failed";
    throw new Error(errorMessage);
  }

  return body as TSuccess;
}

export async function fetchChats(fetchImpl: typeof fetch = fetch): Promise<ChatSummary[]> {
  const response: Response = await fetchImpl("/api/chats");
  const body: ChatListResponse = await readJsonResponse<ChatListResponse>(response);
  return body.chats;
}

export async function createChat(title: string | undefined, fetchImpl: typeof fetch = fetch): Promise<ChatDetail> {
  const response: Response = await fetchImpl("/api/chats", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  const body: ChatDetailResponse = await readJsonResponse<ChatDetailResponse>(response);
  return body.chat;
}

export async function fetchChat(chatId: string, fetchImpl: typeof fetch = fetch): Promise<ChatDetail> {
  const response: Response = await fetchImpl(`/api/chats/${encodeURIComponent(chatId)}`);
  const body: ChatDetailResponse = await readJsonResponse<ChatDetailResponse>(response);
  return body.chat;
}

export async function renameChat(
  chatId: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatDetail> {
  const response: Response = await fetchImpl(`/api/chats/${encodeURIComponent(chatId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  const body: ChatDetailResponse = await readJsonResponse<ChatDetailResponse>(response);
  return body.chat;
}

export async function submitChatMessage(
  chatId: string,
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatPromptResponse> {
  const response: Response = await fetchImpl(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
  return readJsonResponse<ChatPromptResponse>(response);
}
