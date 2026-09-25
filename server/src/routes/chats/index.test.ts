import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test, { type TestContext } from "node:test";
import express from "express";
import type { ThreadEvent } from "@openai/codex-sdk";
import { ChatArchiveService } from "../../services/chat-archive/index.js";
import { CodexService } from "../../services/codex/index.js";
import { createChatsRouter } from "./index.js";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "chat-thread-route-"));
  const archive = new ChatArchiveService(directory);
  const turns: { id: string; prompt: string }[] = [];
  let starts = 0;
  let beforeReply: (prompt: string) => Promise<void> = async () => {};
  class Client {
    startThread() { return this.thread(`thread-${++starts}`); }
    resumeThread(id: string) { return this.thread(id); }
    thread(id: string) {
      return { async runStreamed(prompt: string) {
        turns.push({ id, prompt });
        return { events: (async function* (): AsyncGenerator<ThreadEvent> {
          yield { type: "thread.started", thread_id: id };
          await beforeReply(prompt);
          if (prompt.endsWith("FAIL")) {
            yield { type: "turn.failed", error: { message: "simulated failure" } };
          } else {
            yield { type: "item.completed", item: {
              type: "agent_message", id: "reply", text: "**Saved**\n\n```js src/example.js\nconst n = 7;\n```",
            } };
          }
        })() };
      } };
    }
  }
  async function startServer() {
    const app = express();
    app.use(express.json());
    app.use("/api/chats", createChatsRouter(
      new CodexService({ CodexClient: Client, workingDirectory: ".", model: "test" }),
      new ChatArchiveService(directory),
    ));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return async (chatId: string, prompt: string) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/chats/${chatId}/messages`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }),
      });
      return { status: response.status, body: await response.json() };
    };
  }
  return { archive, turns, startServer, starts: () => starts, setBeforeReply: (fn: typeof beforeReply) => { beforeReply = fn; } };
}

test("chat routes reuse persisted IDs across server instances and isolate new chats", async (t) => {
  const f = await fixture(t);
  const send = await f.startServer();
  const chat = await f.archive.createChat();
  assert.equal((await send(chat.id, "My token is violet")).status, 200);
  assert.equal((await send(chat.id, "What is my token?")).status, 200);
  const restartedSend = await f.startServer();
  const resumed = await restartedSend(chat.id, "Continue after restart");
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.chat.messages.length, 6);
  assert.equal(resumed.body.chat.resources.length, 3);
  assert.equal(f.starts(), 1);
  assert.deepEqual(f.turns.map((turn) => turn.id), ["thread-1", "thread-1", "thread-1"]);
  assert.ok(!f.turns[1].prompt.includes("violet"));
  const other = await f.archive.createChat();
  await restartedSend(other.id, "New conversation");
  assert.equal(f.starts(), 2);
  assert.equal(f.turns[3].id, "thread-2");
  assert.ok(!f.turns[3].prompt.includes("violet"));
});

test("legacy archives seed context once without duplicating saved messages", async (t) => {
  const f = await fixture(t);
  const chat = await f.archive.createChat();
  await f.archive.appendMessage(chat.id, "user", "old question");
  const before = await f.archive.appendMessage(chat.id, "assistant", "old answer");
  const send = await f.startServer();
  const result = await send(chat.id, "new question");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.chat.messages.slice(0, 2), before.messages);
  assert.equal(result.body.chat.messages.length, 4);
  const prompt = f.turns[0].prompt;
  assert.ok(prompt.indexOf("old question") < prompt.indexOf("old answer"));
  assert.ok(prompt.indexOf("old answer") < prompt.indexOf("new question"));
  assert.equal(prompt.split("new question").length, 2);
  await send(chat.id, "next question");
  assert.equal(f.starts(), 1);
  assert.ok(!f.turns[1].prompt.includes("old question"));
});

test("overlapping turns serialize per chat, isolate other chats, and release after failure", async (t) => {
  const f = await fixture(t);
  const chat = await f.archive.createChat();
  const other = await f.archive.createChat();
  const send = await f.startServer();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  f.setBeforeReply(async (prompt) => {
    if (prompt.endsWith("FAIL")) { entered(); await gate; }
  });
  const first = send(chat.id, "FAIL");
  await started;
  assert.equal((await f.archive.loadChat(chat.id)).codexThreadId, "thread-1");
  const second = send(chat.id, "after failure");
  try {
    assert.equal((await send(other.id, "independent")).status, 200);
    assert.equal(f.turns.length, 2);
  } finally { release(); }
  assert.equal((await first).status, 500);
  const result = await second;
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.chat.messages.map((message: { role: string }) => message.role), ["user", "user", "assistant"]);
  assert.equal(result.body.chat.codexThreadId, "thread-1");
  assert.equal(f.starts(), 2);
  assert.equal(f.turns[2].id, "thread-1");
});
