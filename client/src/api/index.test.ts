import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { deleteChat, fetchChats, submitChatMessage } from "@api";
import {
  appendPromptTurn,
  ChatTranscript,
  type ChatMessage,
} from "@components/ChatTranscript";
import { conversationStateFromChat } from "@components/App/conversationState";

class FakeXMLHttpRequest extends EventTarget {
  readonly upload = new EventTarget();
  responseText = "";
  responseType: XMLHttpRequestResponseType = "";
  status = 0;
  statusText = "";
  method = "";
  url = "";
  body: Document | XMLHttpRequestBodyInit | null = null;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  getResponseHeader(name: string): string | null {
    return name.toLowerCase() === "content-type"
      ? "application/json"
      : null;
  }

  send(body: Document | XMLHttpRequestBodyInit | null): void {
    this.body = body;
  }
}

function renderTranscript(
  messages: ChatMessage[],
  isUploadingAttachments: boolean,
): string {
  return renderToStaticMarkup(
    createElement(ChatTranscript, {
      chatId: "chat-1",
      messages,
      isUploadingAttachments,
    }),
  );
}

test("fetchChats returns an empty list for an empty successful response", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("", { status: 200 });

  assert.deepEqual(await fetchChats(fetchImpl), []);
});

test("fetchChats returns an empty list for invalid JSON", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("{", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  assert.deepEqual(await fetchChats(fetchImpl), []);
});

test("fetchChats returns an empty list when the response shape is invalid", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  assert.deepEqual(await fetchChats(fetchImpl), []);
});

test("fetchChats reports a controlled error for an empty error response", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("", { status: 502 });

  await assert.rejects(
    fetchChats(fetchImpl),
    /Request failed with status 502/,
  );
});

test("deleteChat sends a DELETE request for the encoded chat ID", async () => {
  let requestedUrl: string | URL | Request | undefined;
  let requestedInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    requestedUrl = input;
    requestedInit = init;
    return new Response(null, { status: 204 });
  };

  await deleteChat("chat/one", fetchImpl);

  assert.equal(requestedUrl, "/api/chats/chat%2Fone");
  assert.equal(requestedInit?.method, "DELETE");
});

test("deleteChat exposes the server error when deletion fails", async () => {
  const fetchImpl: typeof fetch = async () => new Response(
    JSON.stringify({ error: "Could not delete chat" }),
    {
      status: 500,
      headers: { "content-type": "application/json" },
    },
  );

  await assert.rejects(deleteChat("chat-one", fetchImpl), /Could not delete chat/);
});

test("deleteChat reports a missing chat", async () => {
  const fetchImpl: typeof fetch = async () => new Response(
    JSON.stringify({ error: "Chat not found" }),
    {
      status: 404,
      headers: { "content-type": "application/json" },
    },
  );

  await assert.rejects(deleteChat("missing-chat", fetchImpl), /Chat not found/);
});

test("attachment upload changes Processing attachments to Thinking before applying the model response", async () => {
  const request = new FakeXMLHttpRequest();
  const attachment = new File(["notes"], "notes.txt", {
    type: "text/plain",
  });
  let isUploadingAttachments = true;
  let messages: ChatMessage[] = appendPromptTurn(
    [],
    "Summarize this",
    [{
      name: attachment.name,
      mimeType: attachment.type,
      path: "",
      previewUrl: "blob:notes-preview",
    }],
  ).messages;
  let responseApplied = false;

  const submission = submitChatMessage(
    "chat-1",
    "Summarize this",
    attachment,
    fetch,
    () => {
      isUploadingAttachments = false;
    },
    () => request as unknown as XMLHttpRequest,
  ).then((result) => {
    messages = conversationStateFromChat(result.chat).messages;
    responseApplied = true;
  });

  const uploadingMarkup = renderTranscript(
    messages,
    isUploadingAttachments,
  );
  assert.match(uploadingMarkup, />Processing attachments</);
  assert.doesNotMatch(uploadingMarkup, />Thinking</);
  assert.equal(responseApplied, false);

  request.upload.dispatchEvent(new Event("load"));

  const thinkingMarkup = renderTranscript(
    messages,
    isUploadingAttachments,
  );
  assert.match(thinkingMarkup, />Thinking</);
  assert.doesNotMatch(thinkingMarkup, />Processing attachments</);
  assert.equal(responseApplied, false);

  request.status = 200;
  request.statusText = "OK";
  request.responseText = JSON.stringify({
    finalResponse: "The attachment contains notes.",
    chat: {
      id: "chat-1",
      title: "Notes",
      date: "2026-10-28",
      createdAt: "2026-10-28T10:00:00.000Z",
      updatedAt: "2026-10-28T10:00:01.000Z",
      resources: [],
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Summarize this",
          createdAt: "2026-10-28T10:00:00.000Z",
          resources: [],
          attachments: [{
            name: "notes.txt",
            mimeType: "text/plain",
            path: "notes.txt",
          }],
        },
        {
          id: "message-2",
          role: "assistant",
          content: "The attachment contains notes.",
          createdAt: "2026-10-28T10:00:01.000Z",
          resources: [],
          attachments: [],
        },
      ],
    },
  });
  request.dispatchEvent(new Event("load"));
  await submission;

  const completedMarkup = renderTranscript(
    messages,
    isUploadingAttachments,
  );
  assert.equal(responseApplied, true);
  assert.match(completedMarkup, /The attachment contains notes\./);
  assert.doesNotMatch(completedMarkup, />Thinking</);
  assert.doesNotMatch(completedMarkup, />Processing attachments</);
});
