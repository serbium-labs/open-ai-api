import type {
  ChatDetailResponse,
  ChatListResponse,
  ChatPromptResponse,
} from "@api/types";

import type { ChatDetail, ChatSummary } from "@models";

async function readJsonResponse<TSuccess extends object>(
  response: Response,
  fallback?: TSuccess,
): Promise<TSuccess> {
  const responseText: string = await response.text();
  let body: unknown;

  try {
    body = responseText.trim() === ""
      ? undefined
      : JSON.parse(responseText);
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const errorMessage: string =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;

    throw new Error(errorMessage);
  }

  if (body === undefined) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error("Server returned an empty or invalid JSON response");
  }

  return body as TSuccess;
}

export async function fetchChats(
  fetchImpl: typeof fetch = fetch,
): Promise<ChatSummary[]> {
  const response: Response = await fetchImpl("/api/chats");

  const body: ChatListResponse =
    await readJsonResponse<ChatListResponse>(response, { chats: [] });

  return Array.isArray(body.chats) ? body.chats : [];
}

export async function createChat(
  title: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatDetail> {
  const response: Response = await fetchImpl("/api/chats", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  const body: ChatDetailResponse =
    await readJsonResponse<ChatDetailResponse>(response);

  return body.chat;
}

export async function fetchChat(
  chatId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatDetail> {
  const response: Response = await fetchImpl(
    `/api/chats/${encodeURIComponent(chatId)}`,
  );

  const body: ChatDetailResponse =
    await readJsonResponse<ChatDetailResponse>(response);

  return body.chat;
}

export async function renameChat(
  chatId: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatDetail> {
  const response: Response = await fetchImpl(
    `/api/chats/${encodeURIComponent(chatId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ title }),
    },
  );

  const body: ChatDetailResponse =
    await readJsonResponse<ChatDetailResponse>(response);

  return body.chat;
}

export async function deleteChat(chatId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response: Response = await fetchImpl(`/api/chats/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    await readJsonResponse<Record<string, never>>(response);
  }
}

export async function submitChatMessage(
  chatId: string,
  prompt: string,
  attachmentOrFetch: File | null | typeof fetch = null,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatPromptResponse> {
  const attachment: File | null =
    typeof attachmentOrFetch === "function"
      ? null
      : attachmentOrFetch;

  const requestFetch: typeof fetch =
    typeof attachmentOrFetch === "function"
      ? attachmentOrFetch
      : fetchImpl;

  if (attachment === null) {
    const response: Response = await requestFetch(
      `/api/chats/${encodeURIComponent(chatId)}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      },
    );

    return readJsonResponse<ChatPromptResponse>(response);
  }

  const formData = new FormData();

  formData.append("prompt", prompt);
  formData.append("attachment", attachment);

  const response: Response = await requestFetch(
    `/api/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: "POST",
      body: formData,
    },
  );

  return readJsonResponse<ChatPromptResponse>(response);
}
