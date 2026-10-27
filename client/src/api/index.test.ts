import assert from "node:assert/strict";
import test from "node:test";

import { deleteChat, fetchChats } from "@api";

test("fetchChats returns an empty list for an empty successful response", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("", { status: 200 });

  assert.deepEqual(await fetchChats(fetchImpl), []);
});

test("fetchChats returns an empty list for invalid JSON", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("{", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  assert.deepEqual(await fetchChats(fetchImpl), []);
});

test("fetchChats returns an empty list when the response shape is invalid", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  assert.deepEqual(await fetchChats(fetchImpl), []);
});

test("fetchChats reports a controlled error for an empty error response", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("", { status: 502 });

  await assert.rejects(
    fetchChats(fetchImpl),
    /Request failed with status 502/,
  );
});

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
