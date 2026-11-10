import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createAuthRouter, createRequireAuthentication } from "./index";

const ACCESS_CODE = "UoYh5pykqTZ2Tbmw";

async function withAuthServer(
  callback: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api", createRequireAuthentication(ACCESS_CODE));
  app.use("/api/auth", createAuthRouter(ACCESS_CODE));
  app.get("/api/private", (_request, response) => response.json({ ok: true }));

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();

  assert(address !== null && typeof address === "object");

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    });
  }
}

test("auth middleware rejects protected API requests without a session", async () => {
  await withAuthServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/private`);

    assert.equal(response.status, 401);
  });
});

test("code verification rejects an invalid code", async () => {
  await withAuthServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/verify-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "wrong" }),
    });

    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  });
});

test("a valid code creates an HttpOnly session that unlocks and can log out", async () => {
  await withAuthServer(async (baseUrl) => {
    const verification = await fetch(`${baseUrl}/api/auth/verify-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: ACCESS_CODE }),
    });
    const setCookie = verification.headers.get("set-cookie");

    assert.equal(verification.status, 200);
    assert.match(setCookie ?? "", /early_access_session=/);
    assert.match(setCookie ?? "", /HttpOnly/i);
    assert.match(setCookie ?? "", /SameSite=Strict/i);

    const cookie = setCookie?.split(";", 1)[0] ?? "";
    const protectedResponse = await fetch(`${baseUrl}/api/private`, {
      headers: { cookie },
    });
    assert.equal(protectedResponse.status, 200);

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(logoutResponse.status, 204);
    assert.match(logoutResponse.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970/);
  });
});
