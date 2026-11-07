import { createHmac, timingSafeEqual } from "node:crypto";

import { Router, type Request, type RequestHandler, type Response } from "express";

import { HTTP_STATUS } from "#constants";

const COOKIE_NAME = "early_access_session";
const SESSION_VALUE = "authorized";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function signSession(accessCode: string): string {
  const signature = createHmac("sha256", accessCode)
    .update(SESSION_VALUE)
    .digest("base64url");

  return `${SESSION_VALUE}.${signature}`;
}

function safelyEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;

  if (cookieHeader === undefined) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = cookie.trim().split("=");

    if (cookieName === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return undefined;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function createRequireAuthentication(accessCode: string): RequestHandler {
  const expectedSession = signSession(accessCode);

  return (request: Request, response: Response, next): void => {
    if (request.method === "POST" && request.path === "/auth/verify-code") {
      next();
      return;
    }

    const session = readCookie(request, COOKIE_NAME);

    if (session === undefined || !safelyEqual(session, expectedSession)) {
      response.status(HTTP_STATUS.unauthorized).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}

export function createAuthRouter(accessCode: string): Router {
  const router = Router();

  router.post("/verify-code", (request: Request, response: Response): void => {
    const submittedCode = typeof request.body?.code === "string" ? request.body.code : "";

    if (!safelyEqual(submittedCode, accessCode)) {
      response.status(HTTP_STATUS.forbidden).json({ error: "Invalid access code" });
      return;
    }

    response.cookie(COOKIE_NAME, signSession(accessCode), {
      ...cookieOptions(),
      maxAge: SESSION_MAX_AGE_MS,
    });
    response.status(HTTP_STATUS.ok).json({ authenticated: true });
  });

  router.get("/status", (_request: Request, response: Response): void => {
    response.status(HTTP_STATUS.ok).json({ authenticated: true });
  });

  router.post("/logout", (_request: Request, response: Response): void => {
    response.clearCookie(COOKIE_NAME, cookieOptions());
    response.status(HTTP_STATUS.noContent).end();
  });

  return router;
}
