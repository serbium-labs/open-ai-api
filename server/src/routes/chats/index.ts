import { rm } from "node:fs/promises";

import multer from "multer";
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

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Chat not found" ||
      error.message === "Attachment not found")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unexpected server error";
}

export function createChatsRouter(
  codexService: CodexService,
  chatArchiveService: ChatArchiveService,
): Router {
  const router: Router = Router();
  const pendingMessages = new Map<string, Promise<void>>();

  async function inChatOrder<T>(
    chatId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous =
      pendingMessages.get(chatId) ?? Promise.resolve();

    const result = previous.then(action);
    const settled = result.then(
      () => {},
      () => {},
    );

    pendingMessages.set(chatId, settled);

    try {
      return await result;
    } finally {
      if (pendingMessages.get(chatId) === settled) {
        pendingMessages.delete(chatId);
      }
    }
  }

  router.get(
    "/",
    async (
      _request: Request,
      response: Response<ChatListResponse | ErrorResponse>,
    ) => {
      try {
        response.status(HTTP_STATUS.ok).json({
          chats: await chatArchiveService.listChats(),
        });
      } catch (error: unknown) {
        response
          .status(HTTP_STATUS.internalServerError)
          .json({
            error: errorMessage(error),
          });
      }
    },
  );

  router.post(
    "/",
    async (
      request: Request<
        Record<string, never>,
        ChatDetailResponse | ErrorResponse,
        ChatCreateRequestBody
      >,
      response: Response<ChatDetailResponse | ErrorResponse>,
    ) => {
      try {
        const title: string | undefined =
          typeof request.body.title === "string"
            ? request.body.title
            : undefined;

        response.status(HTTP_STATUS.ok).json({
          chat: await chatArchiveService.createChat(title),
        });
      } catch (error: unknown) {
        response
          .status(HTTP_STATUS.internalServerError)
          .json({
            error: errorMessage(error),
          });
      }
    },
  );

  router.get(
    "/:chatId/attachments/:attachmentName",
    async (
      request: Request<{
        chatId: string;
        attachmentName: string;
      }>,
      response: Response,
    ) => {
      try {
        const attachmentPath =
          await chatArchiveService.getAttachmentPath(
            request.params.chatId,
            request.params.attachmentName,
          );

        response.sendFile(attachmentPath);
      } catch (error: unknown) {
        response.status(
          isNotFound(error)
            ? HTTP_STATUS.notFound
            : HTTP_STATUS.internalServerError,
        );

        response.json({
          error: errorMessage(error),
        });
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
        response.status(HTTP_STATUS.ok).json({
          chat: await chatArchiveService.loadChat(
            request.params.chatId,
          ),
        });
      } catch (error: unknown) {
        response
          .status(
            isNotFound(error)
              ? HTTP_STATUS.notFound
              : HTTP_STATUS.internalServerError,
          )
          .json({
            error: errorMessage(error),
          });
      }
    },
  );

  router.patch(
    "/:chatId",
    async (
      request: Request<
        { chatId: string },
        ChatDetailResponse | ErrorResponse,
        ChatRenameRequestBody
      >,
      response: Response<ChatDetailResponse | ErrorResponse>,
    ) => {
      try {
        const title: string =
          typeof request.body.title === "string"
            ? request.body.title.trim()
            : "";

        if (!title) {
          response
            .status(HTTP_STATUS.badRequest)
            .json({
              error: "Title is required",
            });

          return;
        }

        response.status(HTTP_STATUS.ok).json({
          chat: await chatArchiveService.renameChat(
            request.params.chatId,
            title,
          ),
        });
      } catch (error: unknown) {
        response
          .status(
            isNotFound(error)
              ? HTTP_STATUS.notFound
              : HTTP_STATUS.internalServerError,
          )
          .json({
            error: errorMessage(error),
          });
      }
    },
  );

  router.post(
    "/:chatId/messages",
    upload.single("attachment"),
    async (
      request: Request<
        { chatId: string },
        ChatPromptResponse | ErrorResponse,
        ChatPromptRequestBody
      >,
      response: Response<ChatPromptResponse | ErrorResponse>,
    ) => {
      try {
        const prompt: string =
          typeof request.body.prompt === "string"
            ? request.body.prompt.trim()
            : "";

        if (!prompt && !request.file) {
          response
            .status(HTTP_STATUS.badRequest)
            .json({
              error: "Prompt or attachment is required",
            });

          return;
        }

        const result = await inChatOrder(
          request.params.chatId,
          async () => {
            const previousChat =
              await chatArchiveService.loadChat(
                request.params.chatId,
              );

            const context =
              previousChat.codexThreadId === undefined &&
              previousChat.messages.length > 0
                ? `Previous conversation (JSON transcript):\n${JSON.stringify(
                    previousChat.messages.map(
                      ({ role, content }) => ({
                        role,
                        content,
                      }),
                    ),
                  )}\n\nCurrent user request:\n${prompt}`
                : prompt;

           const chatAfterUserMessage =
  await chatArchiveService.appendMessage(
    previousChat.id,
    "user",
    prompt,
    request.file === undefined
      ? undefined
      : {
          originalName: request.file.originalname,
          mimeType: request.file.mimetype,
          temporaryPath: request.file.path,
        },
  );

const imagePath: string | undefined =
  request.file?.mimetype.startsWith("image/")
    ? request.file.path
    : undefined;

let codexContext = context;

if (
  request.file !== undefined &&
  !request.file.mimetype.startsWith("image/")
) {
  const userMessage = chatAfterUserMessage.messages.at(-1);
  const attachment = userMessage?.attachments.at(0);

  if (attachment !== undefined) {
    const storedAttachmentPath =
      await chatArchiveService.getAttachmentPath(
        previousChat.id,
        attachment.path,
      );

    const attachmentInstruction =
      `Attached file:\n` +
      `Name: ${attachment.name}\n` +
      `MIME type: ${attachment.mimeType}\n` +
      `Local path: ${storedAttachmentPath}\n\n` +
      `Inspect this file when answering the user.`;

    codexContext =
      context.trim() === ""
        ? attachmentInstruction
        : `${context}\n\n${attachmentInstruction}`;
  }
}

const finalResponse =
  await codexService.run(
    codexContext,
                previousChat.codexThreadId,
                (id) =>
                  chatArchiveService.saveThreadId(
                    previousChat.id,
                    id,
                  ),
                imagePath,
              );

            const chat =
              await chatArchiveService.appendMessage(
                previousChat.id,
                "assistant",
                finalResponse,
              );

            return {
              chat,
              finalResponse,
            };
          },
        );

        response.status(HTTP_STATUS.ok).json(result);
      } catch (error: unknown) {
        response
          .status(
            isNotFound(error)
              ? HTTP_STATUS.notFound
              : HTTP_STATUS.internalServerError,
          )
          .json({
            error: errorMessage(error),
          });
      } finally {
        if (request.file !== undefined) {
          await rm(request.file.path, {
            force: true,
          }).catch(() => {});
        }
      }
    },
  );

  return router;
}