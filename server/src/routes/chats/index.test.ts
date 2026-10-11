import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { createChatsRouter } from "#routes/chats";
import { ChatArchiveService } from "#services/chat-archive";
import { CodexService } from "#services/codex";

type TestResponse = {
  body?: unknown;
  statusCode?: number;
};

type RouteLayer = {
  route?: {
    methods: Record<string, boolean>;
    path: string;
    stack: Array<{
      handle: (request: unknown, response: unknown, next: () => void) => Promise<void>;
    }>;
  };
};

async function invokeDeleteRoute(
  chatArchiveService: ChatArchiveService,
  workingDirectory: string,
  chatId: string,
): Promise<TestResponse> {
  const router = createChatsRouter(
    new CodexService({ workingDirectory, model: "test-model" }),
    chatArchiveService,
  ) as unknown as { stack: RouteLayer[] };
  const deleteLayer: RouteLayer | undefined = router.stack.find(
    (layer: RouteLayer) => layer.route?.path === "/:chatId" && layer.route.methods.delete,
  );

  if (deleteLayer?.route === undefined) {
    throw new Error("DELETE chat route was not registered");
  }

  const result: TestResponse = {};
  const response = {
    status(statusCode: number) {
      result.statusCode = statusCode;
      return this;
    },
    send(body?: unknown) {
      result.body = body;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  };

  await deleteLayer.route.stack[0].handle({ params: { chatId } }, response, () => {});
  return result;
}

test("DELETE /api/chats/:chatId deletes a chat and reports a missing chat", async (context: TestContext) => {
  const directory: string = await mkdtemp(join(tmpdir(), "delete-chat-route-"));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  const service = new ChatArchiveService(directory);
  const chat = await service.createChat("Delete me");

  const deletedResponse: TestResponse = await invokeDeleteRoute(service, directory, chat.id);
  assert.equal(deletedResponse.statusCode, 204);
  assert.equal(deletedResponse.body, undefined);

  const missingResponse: TestResponse = await invokeDeleteRoute(service, directory, chat.id);
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Chat not found" });
});

test("DELETE /api/chats/:chatId returns a server error when storage deletion fails", async (context: TestContext) => {
  const directory: string = await mkdtemp(join(tmpdir(), "delete-chat-route-"));
  context.after(async () => rm(directory, { force: true, recursive: true }));

  class FailingChatArchiveService extends ChatArchiveService {
    public override async deleteChat(): Promise<void> {
      throw new Error("Could not delete chat");
    }
  }

  const response: TestResponse = await invokeDeleteRoute(
    new FailingChatArchiveService(directory),
    directory,
    "chat-one",
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Could not delete chat" });
});
