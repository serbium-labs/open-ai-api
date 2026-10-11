import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { ChatArchiveService } from "#services/chat-archive";

async function createArchive(context: TestContext): Promise<{ directory: string; service: ChatArchiveService }> {
  const directory: string = await mkdtemp(join(tmpdir(), "chat-archive-service-"));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  return { directory, service: new ChatArchiveService(directory) };
}

test("ChatArchiveService deletes only the selected chat", async (context: TestContext) => {
  const { directory, service } = await createArchive(context);
  const selectedChat = await service.createChat("Delete me");
  const otherChat = await service.createChat("Keep me");
  const unrelatedFile: string = join(directory, "unrelated.txt");

  await service.appendMessage(selectedChat.id, "assistant", "```ts src/example.ts\nexport {};\n```");
  await writeFile(unrelatedFile, "keep", "utf8");
  await service.deleteChat(selectedChat.id);

  assert.deepEqual((await service.listChats()).map(({ id, title }) => ({ id, title })), [
    { id: otherChat.id, title: otherChat.title },
  ]);
  await assert.rejects(service.loadChat(selectedChat.id), /Chat not found/);
  assert.equal(await readFile(unrelatedFile, "utf8"), "keep");
});

test("ChatArchiveService reports a missing chat without deleting existing chats", async (context: TestContext) => {
  const { service } = await createArchive(context);
  const existingChat = await service.createChat("Keep me");

  await assert.rejects(service.deleteChat("missing-chat"), /Chat not found/);
  assert.deepEqual((await service.listChats()).map(({ id, title }) => ({ id, title })), [
    { id: existingChat.id, title: existingChat.title },
  ]);
});
