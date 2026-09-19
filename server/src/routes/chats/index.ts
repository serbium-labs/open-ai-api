import { Router, type Request, type Response } from "express";

import { HTTP_STATUS } from "#constants";
import type { CodexService } from "#services/codex";
import type { ChatArchiveService } from "#services/chat-archive";
import type {
  ChatCreateRequestBody,
  ChatDetailResponse,
  ChatListResponse,
  ChatPromptRequestBody,
  ChatPromptResponse,
  ChatRenameRequestBody,
  ErrorResponse,
} from "#models";

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === "Chat not found";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error";
}

export function createChatsRouter(codexService: CodexService, chatArchiveService: ChatArchiveService): Router {
  const router: Router = Router();

  router.get(
    "/",
    async (_request: Request, response: Response<ChatListResponse | ErrorResponse>) => {
      try {
        response.status(HTTP_STATUS.ok).json({ chats: await chatArchiveService.listChats() });
      } catch (error: unknown) {
        response.status(HTTP_STATUS.internalServerError).json({ error: errorMessage(error) });
      }
    },
  );

  router.post(
    "/",
    async (
      request: Request<Record<string, never>, ChatDetailResponse | ErrorResponse, ChatCreateRequestBody>,
      response: Response<ChatDetailResponse | ErrorResponse>,
    ) => {
      try {
        const title: string | undefined = typeof request.body.title === "string" ? request.body.title : undefined;
        response.status(HTTP_STATUS.ok).json({ chat: await chatArchiveService.createChat(title) });
      } catch (error: unknown) {
        response.status(HTTP_STATUS.internalServerError).json({ error: errorMessage(error) });
      }
    },
  );

  router.get(
    "/:chatId",
    async (
      request: Request<{ chatId: string }>,
      response: Response<ChatDetailResponse | ErrorResponse>,
    ) => {
      try {
        response.status(HTTP_STATUS.ok).json({ chat: await chatArchiveService.loadChat(request.params.chatId) });
      } catch (error: unknown) {
        response.status(isNotFound(error) ? HTTP_STATUS.notFound : HTTP_STATUS.internalServerError).json({
          error: errorMessage(error),
        });
      }
    },
  );

  router.patch(
    "/:chatId",
    async (
      request: Request<{ chatId: string }, ChatDetailResponse | ErrorResponse, ChatRenameRequestBody>,
      response: Response<ChatDetailResponse | ErrorResponse>,
    ) => {
      try {
        const title: string = typeof request.body.title === "string" ? request.body.title.trim() : "";

        if (!title) {
          response.status(HTTP_STATUS.badRequest).json({ error: "Title is required" });
          return;
        }

        response.status(HTTP_STATUS.ok).json({
          chat: await chatArchiveService.renameChat(request.params.chatId, title),
        });
      } catch (error: unknown) {
        response.status(isNotFound(error) ? HTTP_STATUS.notFound : HTTP_STATUS.internalServerError).json({
          error: errorMessage(error),
        });
      }
    },
  );

  router.post(
    "/:chatId/messages",
    async (
      request: Request<{ chatId: string }, ChatPromptResponse | ErrorResponse, ChatPromptRequestBody>,
      response: Response<ChatPromptResponse | ErrorResponse>,
    ) => {
      try {
        const prompt: string = typeof request.body.prompt === "string" ? request.body.prompt.trim() : "";

        if (!prompt) {
          response.status(HTTP_STATUS.badRequest).json({ error: "Prompt is required" });
          return;
        }

        await chatArchiveService.appendMessage(request.params.chatId, "user", prompt);
        const finalResponse: string = await codexService.run(prompt);
        const chat = await chatArchiveService.appendMessage(request.params.chatId, "assistant", finalResponse);
        response.status(HTTP_STATUS.ok).json({ chat, finalResponse });
      } catch (error: unknown) {
        response.status(isNotFound(error) ? HTTP_STATUS.notFound : HTTP_STATUS.internalServerError).json({
          error: errorMessage(error),
        });
      }
    },
  );

  return router;
}
