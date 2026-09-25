import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ChatArchiveService } from "#services/chat-archive";

async function onlyDirectory(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const entry = entries.find((candidate) => candidate.isDirectory());

  assert.ok(entry);
  return join(directory, entry.name);
}

test("ChatArchiveService writes an Obsidian-linked archive and round-trips quoted YAML", async () => {
  const archiveDirectory: string = await mkdtemp(join(tmpdir(), "chat-archive-"));
  const service = new ChatArchiveService(archiveDirectory);
  const title = 'Example: "quoted" # title';
  const chat = await service.createChat(title);

  await service.appendMessage(chat.id, "user", "Create an example");
  const saved = await service.appendMessage(
    chat.id,
    "assistant",
    "```js src/example.js\nexport const example = true;\n```",
  );

  assert.equal(saved.title, title);
  assert.deepEqual(saved.messages[1]?.resources, ["../resources/src/example.js"]);

  const dateDirectory: string = await onlyDirectory(archiveDirectory);
  const chatDirectory: string = await onlyDirectory(dateDirectory);
  const chatNote: string = await readFile(join(chatDirectory, "chat.md"), "utf8");
  const userNote: string = await readFile(join(chatDirectory, "messages", "001-user.md"), "utf8");
  const assistantNote: string = await readFile(join(chatDirectory, "messages", "002-assistant.md"), "utf8");
  const resourceNote: string = await readFile(
    join(chatDirectory, "resources", "src", "example.js.meta.md"),
    "utf8",
  );

  assert.match(chatNote, /title: "Example: \\"quoted\\" # title"/);
  assert.match(chatNote, /- "\[\[messages\/001-user\]\]"/);
  assert.match(chatNote, /\[001 · user\]\(messages\/001-user\.md\)/);
  assert.match(userNote, /chat: "\[\[\.\.\/chat\]\]"/);
  assert.doesNotMatch(userNote, /previous:/);
  assert.match(assistantNote, /previous: "\[\[001-user\]\]"/);
  assert.match(assistantNote, /- "\[\[\.\.\/resources\/src\/example\.js\.meta\]\]"/);
  assert.match(resourceNote, /message: "\[\[\.\.\/messages\/002-assistant\]\]"/);
});

test("ChatArchiveService initialize adds a message index to legacy chats", async () => {
  const archiveDirectory: string = await mkdtemp(join(tmpdir(), "chat-archive-"));
  const chatDirectory: string = join(archiveDirectory, "2026-09-20", "legacy-chat");
  const messagesDirectory: string = join(chatDirectory, "messages");

  await mkdir(messagesDirectory, { recursive: true });
  await writeFile(
    join(chatDirectory, "chat.md"),
    [
      "---",
      "id: legacy-id",
      "title: Legacy chat",
      "date: 2026-09-20",
      "createdAt: 2026-09-20T08:42:00.573Z",
      "updatedAt: 2026-09-20T08:42:00.573Z",
      "---",
      "# Legacy chat",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(messagesDirectory, "001-user.md"),
    "---\nid: message-id\nrole: user\ncreatedAt: 2026-09-20T08:42:00.583Z\nordinal: 1\nresources:\n---\nHello\n",
    "utf8",
  );

  const service = new ChatArchiveService(archiveDirectory);
  await service.initialize();

  const chatNote: string = await readFile(join(chatDirectory, "chat.md"), "utf8");
  const loaded = await service.loadChat("legacy-id");

  assert.match(chatNote, /- "\[\[messages\/001-user\]\]"/);
  assert.match(chatNote, /\[001 · user\]\(messages\/001-user\.md\)/);
  assert.equal(loaded.messages[0]?.content, "Hello");
});
