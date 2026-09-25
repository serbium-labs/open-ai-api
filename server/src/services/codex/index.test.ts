import assert from "node:assert/strict";
import test from "node:test";
import type { ThreadEvent, ThreadOptions } from "@openai/codex-sdk";
import { CodexService } from "./index.js";

test("starts once, awaits ID storage, resumes with identical options, and returns the last agent message", async () => {
  const calls: { id?: string; options: ThreadOptions }[] = [];
  const prompts: string[] = [];
  let saved: string | undefined;
  class Client {
    startThread(options: ThreadOptions) { calls.push({ options }); return this.thread(); }
    resumeThread(id: string, options: ThreadOptions) { calls.push({ id, options }); return this.thread(); }
    thread() {
      return { async runStreamed(prompt: string) {
        prompts.push(prompt);
        return { events: (async function* (): AsyncGenerator<ThreadEvent> {
          yield { type: "thread.started", thread_id: "thread-1" };
          assert.equal(saved, "thread-1");
          yield { type: "item.completed", item: { type: "agent_message", id: "1", text: "early" } };
          yield { type: "item.completed", item: { type: "agent_message", id: "2", text: "**Final**" } };
        })() };
      } };
    }
  }
  const service = new CodexService({ CodexClient: Client, workingDirectory: ".", model: "test" });
  assert.equal(await service.run("first", undefined, async (id) => {
    await Promise.resolve();
    saved = id;
  }), "**Final**");
  assert.equal(await service.run("second", saved, async () => { assert.fail("must not replace ID"); }), "**Final**");
  assert.equal(calls[0].id, undefined);
  assert.equal(calls[1].id, saved);
  assert.deepEqual(calls[1].options, calls[0].options);
  assert.match(prompts[0], /Return output code chunks as fenced code blocks/);
  assert.ok(prompts[1].endsWith("User request:\nsecond"));
});

test("preserves assignment on turn failure and never starts a replacement on resume failure", async () => {
  let starts = 0;
  let saved: string | undefined;
  class Client {
    startThread() {
      starts++;
      return { async runStreamed() { return { events: (async function* (): AsyncGenerator<ThreadEvent> {
        yield { type: "thread.started", thread_id: "failed-thread" };
        yield { type: "turn.failed", error: { message: "turn failed" } };
      })() }; } };
    }
    resumeThread() { throw new Error("session unavailable"); }
  }
  const service = new CodexService({ CodexClient: Client, workingDirectory: ".", model: "test" });
  await assert.rejects(service.run("first", undefined, async (id) => { saved = id; }), /turn failed/);
  assert.equal(saved, "failed-thread");
  await assert.rejects(service.run("next", saved), /session unavailable/);
  assert.equal(starts, 1);
});

test("storage failure stops event consumption and closes the generator", async () => {
  let closed = false;
  let advanced = false;
  class Client {
    startThread() {
      return { async runStreamed() { return { events: (async function* (): AsyncGenerator<ThreadEvent> {
        try {
          yield { type: "thread.started", thread_id: "new-thread" };
          advanced = true;
        } finally { closed = true; }
      })() }; } };
    }
    resumeThread() { return this.startThread(); }
  }
  const service = new CodexService({ CodexClient: Client, workingDirectory: ".", model: "test" });
  await assert.rejects(service.run("first", undefined, async () => { throw new Error("disk failure"); }), /disk failure/);
  assert.equal(advanced, false);
  assert.equal(closed, true);
});
