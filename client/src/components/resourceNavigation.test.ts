import assert from "node:assert/strict";
import test from "node:test";

import type { ChatResource } from "@models";

import {
  getHighlightedMessageId,
  getTranscriptScrollTop,
  resolveResourceNavigation,
} from "./resourceNavigation";

const resources: ChatResource[] = [
  {
    id: "resource-first",
    messageId: "message-first",
    path: "src/repeated.ts",
    content: "export const version = 1;",
    createdAt: "2026-10-11T10:00:00.000Z",
  },
  {
    id: "resource-second",
    messageId: "message-second",
    path: "src/repeated.ts",
    content: "export const version = 2;",
    createdAt: "2026-10-11T10:01:00.000Z",
  },
];

test("resource navigation uses stable resource identity when filenames repeat", () => {
  assert.deepEqual(resolveResourceNavigation(resources, "resource-second", 4), {
    resourceId: "resource-second",
    messageId: "message-second",
    requestId: 4,
  });
});

test("resource navigation ignores a missing resource", () => {
  assert.equal(resolveResourceNavigation(resources, "resource-missing", 1), undefined);
});

test("highlight selection requires the producing message to be loaded", () => {
  const target = resolveResourceNavigation(resources, "resource-second", 1);

  assert.equal(getHighlightedMessageId(target, ["message-first", "message-second"]), "message-second");
  assert.equal(getHighlightedMessageId(target, ["message-first"]), undefined);
});

test("transcript scroll position centers and clamps the selected message", () => {
  assert.equal(getTranscriptScrollTop({
    scrollTop: 300,
    scrollHeight: 2_000,
    clientHeight: 500,
    containerTop: 100,
    targetTop: 350,
    targetHeight: 100,
  }), 350);

  assert.equal(getTranscriptScrollTop({
    scrollTop: 0,
    scrollHeight: 400,
    clientHeight: 500,
    containerTop: 100,
    targetTop: 50,
    targetHeight: 100,
  }), 0);
});
