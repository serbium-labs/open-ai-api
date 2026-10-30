import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CodexService,
  type CodexClient,
  type CodexConstructor,
  type CodexThread,
} from "#services/codex";
import type { Input, ThreadEvent, ThreadOptions } from "@openai/codex-sdk";

function eventStream(events: ThreadEvent[]): AsyncGenerator<ThreadEvent> {
  return (async function* generate() {
    yield* events;
  })();
}

test("CodexService returns images emitted by a completed MCP tool call", async () => {
  const png = Buffer.from("generated png");
  const events = [
    { type: "thread.started", thread_id: "thread-1" },
    {
      type: "item.completed",
      item: {
        id: "tool-1",
        type: "mcp_tool_call",
        server: "image_gen",
        tool: "imagegen",
        arguments: {},
        status: "completed",
        result: {
          content: [{
            type: "image",
            data: png.toString("base64"),
            mimeType: "image/png",
          }],
          structured_content: {},
        },
      },
    },
    {
      type: "item.completed",
      item: { id: "message-1", type: "agent_message", text: "Edited." },
    },
  ] as ThreadEvent[];

  class FakeCodex implements CodexClient {
    public startThread(_options: ThreadOptions): CodexThread {
      return this.thread();
    }

    public resumeThread(_id: string, _options: ThreadOptions): CodexThread {
      return this.thread();
    }

    private thread(): CodexThread {
      return {
        async runStreamed(_input: Input) {
          return { events: eventStream(events) };
        },
      };
    }
  }

  const service = new CodexService({
    CodexClient: FakeCodex as CodexConstructor,
    workingDirectory: "/tmp",
    model: "test-model",
    generatedImagesDirectory: await mkdtemp(join(tmpdir(), "codex-images-test-")),
  });
  const result = await service.run("Edit this photo");

  assert.equal(result.finalResponse, "Edited.");
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0]?.mimeType, "image/png");
  assert.equal(result.attachments[0]?.originalName, "generated-image-1.png");
  assert.deepEqual(result.attachments[0]?.data, png);
});

test("CodexService returns new images saved in the thread generated_images directory", async () => {
  const generatedImagesDirectory = await mkdtemp(join(tmpdir(), "codex-images-test-"));
  const threadDirectory = join(generatedImagesDirectory, "thread-1");
  const oldImage = Buffer.from("old image");
  const newImage = Buffer.from("new image");
  await mkdir(threadDirectory);
  await writeFile(join(threadDirectory, "existing.png"), oldImage);

  class FakeCodex implements CodexClient {
    public startThread(_options: ThreadOptions): CodexThread {
      return this.thread();
    }

    public resumeThread(_id: string, _options: ThreadOptions): CodexThread {
      return this.thread();
    }

    private thread(): CodexThread {
      return {
        async runStreamed(_input: Input) {
          return {
            events: (async function* generate() {
              yield { type: "turn.started" } as ThreadEvent;
              await writeFile(join(threadDirectory, "edited.webp"), newImage);
              yield {
                type: "item.completed",
                item: { id: "message-1", type: "agent_message", text: "Edited." },
              } as ThreadEvent;
            })(),
          };
        },
      };
    }
  }

  const service = new CodexService({
    CodexClient: FakeCodex as CodexConstructor,
    workingDirectory: "/tmp",
    model: "test-model",
    generatedImagesDirectory,
  });
  const result = await service.run("Edit this photo", "thread-1");

  assert.equal(result.finalResponse, "Edited.");
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0]?.originalName, "edited.webp");
  assert.equal(result.attachments[0]?.mimeType, "image/webp");
  assert.deepEqual(result.attachments[0]?.data, newImage);
});

test("CodexService detects generated images for a newly started thread", async () => {
  const generatedImagesDirectory = await mkdtemp(join(tmpdir(), "codex-images-test-"));
  const threadDirectory = join(generatedImagesDirectory, "new-thread");
  const generatedImage = Buffer.from("generated image");

  class FakeCodex implements CodexClient {
    public startThread(_options: ThreadOptions): CodexThread {
      return this.thread();
    }

    public resumeThread(_id: string, _options: ThreadOptions): CodexThread {
      return this.thread();
    }

    private thread(): CodexThread {
      return {
        async runStreamed(_input: Input) {
          return {
            events: (async function* generate() {
              yield { type: "thread.started", thread_id: "new-thread" } as ThreadEvent;
              await mkdir(threadDirectory);
              await writeFile(join(threadDirectory, "generated.jpg"), generatedImage);
              yield {
                type: "item.completed",
                item: { id: "message-1", type: "agent_message", text: "Generated." },
              } as ThreadEvent;
            })(),
          };
        },
      };
    }
  }

  const service = new CodexService({
    CodexClient: FakeCodex as CodexConstructor,
    workingDirectory: "/tmp",
    model: "test-model",
    generatedImagesDirectory,
  });
  const result = await service.run("Generate an image");

  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0]?.originalName, "generated.jpg");
  assert.deepEqual(result.attachments[0]?.data, generatedImage);
});

test("CodexService returns no filesystem attachments when no images were generated", async () => {
  const generatedImagesDirectory = await mkdtemp(join(tmpdir(), "codex-images-test-"));

  class FakeCodex implements CodexClient {
    public startThread(_options: ThreadOptions): CodexThread {
      return this.thread();
    }

    public resumeThread(_id: string, _options: ThreadOptions): CodexThread {
      return this.thread();
    }

    private thread(): CodexThread {
      return {
        async runStreamed(_input: Input) {
          return {
            events: eventStream([{
              type: "item.completed",
              item: { id: "message-1", type: "agent_message", text: "Text only." },
            } as ThreadEvent]),
          };
        },
      };
    }
  }

  const service = new CodexService({
    CodexClient: FakeCodex as CodexConstructor,
    workingDirectory: "/tmp",
    model: "test-model",
    generatedImagesDirectory,
  });
  const result = await service.run("Text request", "thread-without-images");

  assert.equal(result.finalResponse, "Text only.");
  assert.deepEqual(result.attachments, []);
});
