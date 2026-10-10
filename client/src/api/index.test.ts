import assert from "node:assert/strict";
import test from "node:test";

import { deleteChat } from "@api";

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
