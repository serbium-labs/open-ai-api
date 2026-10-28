import type {
  ChatDetailResponse,
  ChatListResponse,
  ChatPromptResponse,
} from "@api/types";

import type { ChatDetail, ChatSummary } from "@models";

export type XMLHttpRequestFactory = () => XMLHttpRequest;

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
  attachmentsOrFetch: File[] | typeof fetch = [],
  fetchImpl: typeof fetch = fetch,
  onAttachmentUploadComplete?: () => void,
  createXMLHttpRequest: XMLHttpRequestFactory = () => new XMLHttpRequest(),
): Promise<ChatPromptResponse> {
  const attachments: File[] =
    typeof attachmentsOrFetch === "function"
      ? []
      : attachmentsOrFetch;

  const requestFetch: typeof fetch =
    typeof attachmentsOrFetch === "function"
      ? attachmentsOrFetch
      : fetchImpl;

  if (attachments.length === 0) {
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
  attachments.forEach((attachment: File) => {
    formData.append("attachments", attachment);
  });

  if (requestFetch === fetch && onAttachmentUploadComplete !== undefined) {
    return new Promise<ChatPromptResponse>((resolve, reject) => {
      const request = createXMLHttpRequest();

      request.open(
        "POST",
        `/api/chats/${encodeURIComponent(chatId)}/messages`,
      );
      request.responseType = "text";
      request.upload.addEventListener("load", onAttachmentUploadComplete, {
        once: true,
      });
      request.addEventListener("load", () => {
        void readJsonResponse<ChatPromptResponse>(
          new Response(request.responseText, {
            status: request.status,
            statusText: request.statusText,
            headers: {
              "content-type": request.getResponseHeader("content-type") ??
                "application/json",
            },
          }),
        ).then(resolve, reject);
      });
      request.addEventListener("error", () => {
        reject(new Error("Network error while submitting message"));
      });
      request.addEventListener("abort", () => {
        reject(new Error("Message submission was aborted"));
      });
      request.send(formData);
    });
  }

  const response: Response = await requestFetch(
    `/api/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: "POST",
      body: formData,
    },
  );

  onAttachmentUploadComplete?.();

  return readJsonResponse<ChatPromptResponse>(response);
}
