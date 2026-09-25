import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChatArchiveService } from "./index.js";

test("thread metadata survives restart, rename and append without changing archived messages or resources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chat-thread-archive-"));
  const archive = new ChatArchiveService(directory);
  const chat = await archive.createChat();
  assert.equal(chat.codexThreadId, undefined);
  await archive.appendMessage(chat.id, "user", "Remember this code");
  const before = await archive.appendMessage(chat.id, "assistant", "**Example**\n\n```js src/example.js\nconst value = 7;\n```");
  await archive.saveThreadId(chat.id, "thread-1");
  const restarted = new ChatArchiveService(directory);
  const loaded = await restarted.loadChat(chat.id);
  assert.equal(loaded.codexThreadId, "thread-1");
  assert.deepEqual(loaded.messages, before.messages);
  assert.deepEqual(loaded.resources, before.resources);
  assert.equal(loaded.resources.length, 1);
  await restarted.renameChat(chat.id, "Renamed");
  const appended = await restarted.appendMessage(chat.id, "user", "Continue");
  assert.equal(appended.codexThreadId, "thread-1");
  assert.equal(appended.title, "Renamed");
  assert.deepEqual(appended.messages.slice(0, 2), before.messages);
  assert.deepEqual(appended.resources, before.resources);
  assert.equal((await restarted.listChats())[0].codexThreadId, "thread-1");
});
