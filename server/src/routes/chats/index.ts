import { open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

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
import type { AudioDurationReader } from "#services/audio-duration";
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

const ATTACHMENT_MIME_TYPES: Readonly<Record<string, string>> = {
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

export function getAttachmentMimeType(path: string): string | undefined {
  return ATTACHMENT_MIME_TYPES[extname(path).toLowerCase()];
}

export async function detectAttachmentMimeType(
  path: string,
  declaredMimeType?: string,
  originalName?: string,
): Promise<string | undefined> {
  const file = await open(path, "r");

  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);

    if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
      return "audio/webm";
    }
    if (bytes.subarray(0, 4).toString("ascii") === "OggS") {
      return "audio/ogg";
    }
    if (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WAVE"
    ) {
      return "audio/wav";
    }
    if (bytes.subarray(4, 8).toString("ascii") === "ftyp") {
      return "audio/mp4";
    }
    if (bytes.subarray(0, 4).toString("ascii") === "fLaC") {
      return "audio/flac";
    }
    if (
      bytes.subarray(0, 3).toString("ascii") === "ID3" ||
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    ) {
      return "audio/mpeg";
    }
  } finally {
    await file.close();
  }

  return (
    getAttachmentMimeType(path) ??
    (originalName === undefined
      ? undefined
      : getAttachmentMimeType(originalName)) ??
    (declaredMimeType?.startsWith("audio/") === true
      ? declaredMimeType
      : undefined)
  );
}

type ProcessChatMessageOptions = {
  audioDurationReader: AudioDurationReader;
  audioTranscriber: AudioTranscriber;
  chatArchiveService: ChatArchiveService;
  chatId: string;
  codexService: CodexService;
  files: Express.Multer.File[];
  prompt: string;
};

export async function processChatMessage({
  audioDurationReader,
  audioTranscriber,
  chatArchiveService,
  chatId,
  codexService,
  files,
  prompt,
}: ProcessChatMessageOptions): Promise<ChatPromptResponse> {
  const previousChat = await chatArchiveService.loadChat(chatId);

  let userContent = prompt;
  const incomingAttachments = [];
  for (const file of files) {
    let normalizedAudio: NormalizedAudioUpload | undefined;
    let durationSeconds: number | undefined;
    if (looksLikeAudioUpload(file.originalname, file.mimetype)) {
      normalizedAudio = await inspectAudioUpload(file.path, file.originalname);
      durationSeconds = await audioDurationReader.readDurationSeconds(file.path);
      const transcript = await audioTranscriber.transcribe({ path: file.path, sizeBytes: file.size });
      const transcriptContent = `Voice message transcript:\n${transcript}`;
      userContent = userContent === "" ? transcriptContent : `${userContent}\n\n${transcriptContent}`;
    }
    incomingAttachments.push({
      originalName: normalizedAudio?.originalName ?? file.originalname,
      mimeType: normalizedAudio?.mimeType ?? file.mimetype,
      temporaryPath: file.path,
      durationSeconds,
    });
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

  const chatAfterUserMessage =
    await chatArchiveService.appendMessage(
      previousChat.id,
      "user",
      userContent,
      incomingAttachments,
    );

  const imagePaths: string[] = files
    .filter((file: Express.Multer.File) => file.mimetype.startsWith("image/"))
    .map((file: Express.Multer.File) => file.path);

  let codexContext = context;

  const ordinaryAttachments = chatAfterUserMessage.messages.at(-1)?.attachments.filter(
    (attachment) => !attachment.mimeType.startsWith("image/") && !attachment.mimeType.startsWith("audio/"),
  ) ?? [];
  if (ordinaryAttachments.length > 0) {
    const userMessage = chatAfterUserMessage.messages.at(-1);
    const instructions = await Promise.all(ordinaryAttachments.map(async (attachment) => {
      const storedAttachmentPath =
        await chatArchiveService.getAttachmentPath(
          previousChat.id,
          attachment.path,
        );
      return (
        `Attached file:\n` +
        `Name: ${attachment.name}\n` +
        `MIME type: ${attachment.mimeType}\n` +
        `Local path: ${storedAttachmentPath}\n\n` +
        `Inspect this file when answering the user.`
      );
    }));
    const attachmentInstruction = instructions.join("\n\n");
    codexContext = context.trim() === "" ? attachmentInstruction : `${context}\n\n${attachmentInstruction}`;
  }

  const codexResult = await codexService.run(
    codexContext,
    previousChat.codexThreadId,
    (id) =>
      chatArchiveService.saveThreadId(previousChat.id, id),
    imagePaths,
  );

  const { finalResponse, attachments: outputAttachments } =
    typeof codexResult === "string"
      ? { finalResponse: codexResult, attachments: [] }
      : codexResult;

  const chat = await chatArchiveService.appendMessage(
    previousChat.id,
    "assistant",
    finalResponse,
    outputAttachments,
  );

  return { chat, finalResponse };
}

export function createChatsRouter(
  codexService: CodexService,
  chatArchiveService: ChatArchiveService,
  audioTranscriber: AudioTranscriber,
  audioDurationReader: AudioDurationReader,
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
        const chat = await chatArchiveService.loadChat(
          request.params.chatId,
        );
        const requestedName: string = request.params.attachmentName;
        const attachment = chat.messages
          .flatMap((message) => message.attachments)
          .find((candidate) => candidate.path === requestedName);
        const attachmentPath =
          await chatArchiveService.getAttachmentPath(
            request.params.chatId,
            requestedName,
          );

        const mimeType: string | undefined =
          await detectAttachmentMimeType(
            attachmentPath,
            attachment?.mimeType,
            attachment?.name,
          );

        if (mimeType !== undefined) {
          response.type(mimeType);
        }

        response.set("Cache-Control", "private, no-cache");

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

  router.delete(
    "/:chatId",
    async (
      request: Request<{ chatId: string }>,
      response: Response<void | ErrorResponse>,
    ) => {
      try {
        await inChatOrder(request.params.chatId, () => chatArchiveService.deleteChat(request.params.chatId));
        response.status(HTTP_STATUS.noContent).send();
      } catch (error: unknown) {
        response.status(isNotFound(error) ? HTTP_STATUS.notFound : HTTP_STATUS.internalServerError).json({
          error: errorMessage(error),
        });
      }
    },
  );

  router.post(
    "/:chatId/messages",
    upload.array("attachments", 5),
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

        const files: Express.Multer.File[] = Array.isArray(request.files)
          ? request.files
          : [];

        if (!prompt && files.length === 0) {
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
            audioDurationReader,
            audioTranscriber,
            chatArchiveService,
            chatId: request.params.chatId,
            codexService,
            files,
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
        await Promise.all((Array.isArray(request.files) ? request.files : []).map(
          (file: Express.Multer.File) => rm(file.path, { force: true }).catch(() => {}),
        ));
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
