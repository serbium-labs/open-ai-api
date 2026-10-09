import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import multer from "multer";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { HTTP_STATUS } from "#constants";
import type { CodexService } from "#services/codex";
import type { ChatArchiveService } from "#services/chat-archive";
import {
  inspectAudioUpload,
  looksLikeAudioUpload,
  type NormalizedAudioUpload,
} from "#services/audio-format";
import type { AudioTranscriber } from "#services/audio-transcription";
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
  dest: join(tmpdir(), "codex-chat-uploads"),
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

type ProcessChatMessageOptions = {
  audioTranscriber: AudioTranscriber;
  chatArchiveService: ChatArchiveService;
  chatId: string;
  codexService: CodexService;
  file: Express.Multer.File | undefined;
  prompt: string;
};

export async function processChatMessage({
  audioTranscriber,
  chatArchiveService,
  chatId,
  codexService,
  file,
  prompt,
}: ProcessChatMessageOptions): Promise<ChatPromptResponse> {
  const previousChat = await chatArchiveService.loadChat(chatId);

  let userContent = prompt;
  let normalizedAudio: NormalizedAudioUpload | undefined;

  if (
    file !== undefined &&
    looksLikeAudioUpload(file.originalname, file.mimetype)
  ) {
    normalizedAudio = await inspectAudioUpload(
      file.path,
      file.originalname,
    );
    const transcript = await audioTranscriber.transcribe({
      path: file.path,
      sizeBytes: file.size,
    });
    const transcriptContent =
      `Voice message transcript:\n${transcript}`;

    userContent = prompt === ""
      ? transcriptContent
      : `${prompt}\n\n${transcriptContent}`;
  }

  const context =
    previousChat.codexThreadId === undefined &&
    previousChat.messages.length > 0
      ? `Previous conversation (JSON transcript):\n${JSON.stringify(
          previousChat.messages.map(
            ({ role, content }) => ({ role, content }),
          ),
        )}\n\nCurrent user request:\n${userContent}`
      : userContent;

  const attachmentInput = file === undefined
    ? undefined
    : {
        originalName:
          normalizedAudio?.originalName ?? file.originalname,
        mimeType: normalizedAudio?.mimeType ?? file.mimetype,
        temporaryPath: file.path,
      };
  const chatAfterUserMessage =
    await chatArchiveService.appendMessage(
      previousChat.id,
      "user",
      userContent,
      attachmentInput,
    );

  const imagePath: string | undefined =
    file?.mimetype.startsWith("image/")
      ? file.path
      : undefined;

  let codexContext = context;

  if (
    file !== undefined &&
    normalizedAudio === undefined &&
    !file.mimetype.startsWith("image/")
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

      codexContext = context.trim() === ""
        ? attachmentInstruction
        : `${context}\n\n${attachmentInstruction}`;
    }
  }

  const finalResponse = await codexService.run(
    codexContext,
    previousChat.codexThreadId,
    (id) =>
      chatArchiveService.saveThreadId(previousChat.id, id),
    imagePath,
  );

  const chat = await chatArchiveService.appendMessage(
    previousChat.id,
    "assistant",
    finalResponse,
  );

  return { chat, finalResponse };
}

export function createChatsRouter(
  codexService: CodexService,
  chatArchiveService: ChatArchiveService,
  audioTranscriber: AudioTranscriber,
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
          () => processChatMessage({
            audioTranscriber,
            chatArchiveService,
            chatId: request.params.chatId,
            codexService,
            file: request.file,
            prompt,
          }),
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

  router.use(
    (
      error: unknown,
      _request: Request,
      response: Response<ErrorResponse>,
      next: NextFunction,
    ) => {
      if (!(error instanceof multer.MulterError)) {
        next(error);
        return;
      }

      if (error.code === "LIMIT_FILE_SIZE") {
        response.status(HTTP_STATUS.payloadTooLarge).json({
          error: "Attachment is too large. The limit is 20 MB.",
        });
        return;
      }

      response.status(HTTP_STATUS.badRequest).json({
        error: `Attachment upload failed: ${error.message}`,
      });
    },
  );

  return router;
}
