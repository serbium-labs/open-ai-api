import assert from "node:assert/strict";
import test from "node:test";

import type { ChatDetail, ChatSummary } from "@models";

import {
  createFreshConversationState,
  loadConversation,
  loadChatHistory,
} from "./conversationState";

const summaries: ChatSummary[] = [
  {
    id: "chat-recent",
    title: "Recent chat",
    date: "2026-10-10",
    createdAt: "2026-10-10T08:00:00.000Z",
    updatedAt: "2026-10-10T09:00:00.000Z",
  },
  {
    id: "chat-older",
    title: "Older chat",
    date: "2026-10-09",
    createdAt: "2026-10-09T08:00:00.000Z",
    updatedAt: "2026-10-09T09:00:00.000Z",
  },
];

test("startup creates a fresh empty conversation", () => {
  assert.deepEqual(createFreshConversationState(), {
    currentChatId: undefined,
    messages: [],
    files: [],
    codeStatus: "No generated code blocks yet.",
  });
});

test("startup loads existing chat history without selecting or changing it", async () => {
  let loadCount: number = 0;

  const history: ChatSummary[] = await loadChatHistory(async () => {
    loadCount += 1;
    return summaries;
  });

  assert.equal(loadCount, 1);
  assert.deepEqual(history, summaries);
  assert.equal(createFreshConversationState().currentChatId, undefined);
});

test("manual selection fetches and restores the requested conversation", async () => {
  const selectedChat: ChatDetail = {
    ...summaries[1],
    messages: [
      {
        id: "message-1",
        role: "user",
        content: "Open the saved chat",
        createdAt: "2026-10-09T08:01:00.000Z",
        resources: [],
      },
    ],
    resources: [
      {
        id: "resource-1",
        messageId: "message-1",
        path: "src/example.ts",
        content: "export {};",
        language: "typescript",
        createdAt: "2026-10-09T08:02:00.000Z",
      },
    ],
  };
  let requestedChatId: string | undefined;

  const state = await loadConversation("chat-older", async (chatId: string) => {
    requestedChatId = chatId;
    return selectedChat;
  });

  assert.equal(requestedChatId, "chat-older");
  assert.deepEqual(state, {
    currentChatId: "chat-older",
    messages: [
      {
        id: "message-1",
        role: "user",
        content: "Open the saved chat",
        status: "complete",
      },
    ],
    files: selectedChat.resources,
    codeStatus: "1 file",
  });
});
