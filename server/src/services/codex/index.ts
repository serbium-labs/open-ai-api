import {
  Codex,
  type Input,
  type ThreadEvent,
  type ThreadOptions,
} from "@openai/codex-sdk";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CODEX_SANDBOX_MODE } from "#constants";

export type CodexThread = {
  runStreamed(input: Input): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
};

export type CodexClient = {
  startThread(options: ThreadOptions): CodexThread;
  resumeThread(id: string, options: ThreadOptions): CodexThread;
};

export type CodexConstructor = new () => CodexClient;

export type CodexServiceDependencies = {
  CodexClient?: CodexConstructor;
  workingDirectory: string;
  model: string;
  generatedImagesDirectory?: string;
};

export type CodexOutputAttachment = {
  originalName: string;
  mimeType: string;
  data: Buffer;
};

export type CodexRunResult = {
  finalResponse: string;
  attachments: CodexOutputAttachment[];
};

const EDIT_INSTRUCTION_LINES: readonly string[] = [
  "Return output code chunks as fenced code blocks.",
  "When a code block represents a file, include a safe relative path in the fence info such as ```js src/example.js.",
  "For Markdown files, use a fenced code block with md or markdown and a .md path such as ```md docs/example.md.",
  "When external MCP tools are available, use them when needed to read data or perform actions in connected services.",
  "Do not rely on pre-existing generated files and do not apply edits on disk.",
];

function createInput(prompt: string, imagePaths: string[] = []): Input {
  const userRequest: string =
    prompt.trim() !== ""
      ? prompt
      : "Please inspect the attached image.";

  const text: string =
    `${EDIT_INSTRUCTION_LINES.join(" ")}\n\nUser request:\n${userRequest}`;

  if (imagePaths.length === 0) {
    return text;
  }

  return [
    {
      type: "text",
      text,
    },
    ...imagePaths.map((path: string) => ({
      type: "local_image",
      path,
    }) as const),
  ];
}

function extensionForMimeType(mimeType: string): string {
  return new Map<string, string>([
    ["image/gif", "gif"],
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ]).get(mimeType.toLowerCase()) ?? "img";
}

function mimeTypeForPath(path: string): string | undefined {
  return new Map<string, string>([
    [".gif", "image/gif"],
    [".jpeg", "image/jpeg"],
    [".jpg", "image/jpeg"],
    [".png", "image/png"],
    [".webp", "image/webp"],
  ]).get(extname(path).toLowerCase());
}

async function attachmentFromResourceLink(
  uri: string,
  declaredMimeType: string | undefined,
  index: number,
): Promise<CodexOutputAttachment | undefined> {
  const url = new URL(uri);
  const inferredMimeType = mimeTypeForPath(url.pathname);
  if (
    declaredMimeType !== undefined &&
    !declaredMimeType.startsWith("image/")
  ) {
    return undefined;
  }

  if (declaredMimeType === undefined && inferredMimeType === undefined) {
    return undefined;
  }

  let data: Buffer;
  let mimeType: string | undefined = declaredMimeType ?? inferredMimeType;

  if (url.protocol === "file:") {
    data = await readFile(fileURLToPath(url));
  } else if (url.protocol === "data:") {
    const match = uri.match(/^data:(image\/[^;,]+);base64,(.+)$/s);
    if (match === null) {
      return undefined;
    }
    mimeType = match[1];
    data = Buffer.from(match[2], "base64");
  } else if (url.protocol === "http:" || url.protocol === "https:") {
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }
    const responseMimeType = response.headers.get("content-type")?.split(";", 1)[0];
    mimeType = responseMimeType?.startsWith("image/")
      ? responseMimeType
      : mimeType;
    if (mimeType === undefined || !mimeType.startsWith("image/")) {
      return undefined;
    }
    data = Buffer.from(await response.arrayBuffer());
  } else {
    return undefined;
  }

  if (mimeType === undefined || !mimeType.startsWith("image/")) {
    return undefined;
  }

  const fallbackName = `generated-image-${index + 1}.${extensionForMimeType(mimeType)}`;
  return {
    originalName: url.protocol === "data:"
      ? fallbackName
      : basename(url.pathname) || fallbackName,
    mimeType,
    data,
  };
}

async function imageAttachmentsFromContent(content: unknown): Promise<CodexOutputAttachment[]> {
  if (!Array.isArray(content)) {
    return [];
  }

  const attachments = await Promise.all(content.map(async (block: unknown, index: number) => {
    if (typeof block !== "object" || block === null) {
      return undefined;
    }

    const value = block as Record<string, unknown>;
    if (value.type === "resource_link" && typeof value.uri === "string") {
      return attachmentFromResourceLink(
        value.uri,
        typeof value.mimeType === "string" ? value.mimeType : undefined,
        index,
      );
    }

    if (
      value.type === "image" &&
      typeof value.data === "string" &&
      typeof value.mimeType === "string" &&
      value.mimeType.startsWith("image/")
    ) {
      return {
        originalName: `generated-image-${index + 1}.${extensionForMimeType(value.mimeType)}`,
        mimeType: value.mimeType,
        data: Buffer.from(value.data, "base64"),
      };
    }

    return undefined;
  }));

  return attachments.filter(
    (attachment): attachment is CodexOutputAttachment => attachment !== undefined,
  );
}

async function generatedImageNames(directory: string): Promise<Set<string>> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return new Set(entries
      .filter((entry) => entry.isFile() && mimeTypeForPath(entry.name) !== undefined)
      .map((entry) => entry.name));
  } catch {
    return new Set();
  }
}

async function generatedImageAttachments(
  directory: string,
  previousNames: ReadonlySet<string>,
): Promise<CodexOutputAttachment[]> {
  const currentNames = await generatedImageNames(directory);
  const newNames = [...currentNames]
    .filter((name) => !previousNames.has(name))
    .sort();

  const attachments = await Promise.all(newNames.map(async (
    name,
  ): Promise<CodexOutputAttachment | undefined> => {
    const mimeType = mimeTypeForPath(name);
    if (mimeType === undefined) {
      return undefined;
    }

    try {
      return {
        originalName: name,
        mimeType,
        data: await readFile(join(directory, name)),
      };
    } catch {
      return undefined;
    }
  }));

  return attachments.filter(
    (attachment): attachment is CodexOutputAttachment => attachment !== undefined,
  );
}

export class CodexService {
  private readonly CodexClient: CodexConstructor;
  private readonly workingDirectory: string;
  private readonly model: string;
  private readonly generatedImagesDirectory: string;

  public constructor({
    CodexClient = Codex,
    workingDirectory,
    model,
    generatedImagesDirectory = join(
      process.env.CODEX_HOME ?? join(homedir(), ".codex"),
      "generated_images",
    ),
  }: CodexServiceDependencies) {
    this.CodexClient = CodexClient;
    this.workingDirectory = workingDirectory;
    this.model = model;
    this.generatedImagesDirectory = generatedImagesDirectory;
  }

  public async run(
    prompt: string,
    threadId?: string,
    onThreadStarted?: (id: string) => Promise<void>,
    imagePaths: string[] = [],
  ): Promise<CodexRunResult> {
    const codex: CodexClient = new this.CodexClient();

    const options: ThreadOptions = {
      model: this.model,
      workingDirectory: this.workingDirectory,
      sandboxMode: CODEX_SANDBOX_MODE,
      skipGitRepoCheck: true,
    };

    const thread =
      threadId === undefined
        ? codex.startThread(options)
        : codex.resumeThread(threadId, options);

    let generatedImagesPath = threadId === undefined
      ? undefined
      : join(this.generatedImagesDirectory, threadId);
    let imagesBeforeTurn = generatedImagesPath === undefined
      ? new Set<string>()
      : await generatedImageNames(generatedImagesPath);

    const { events } = await thread.runStreamed(
      createInput(prompt, imagePaths),
    );

    let finalResponse = "";
    const attachments: CodexOutputAttachment[] = [];

    for await (const event of events) {
      if (event.type === "thread.started" && threadId === undefined) {
        await onThreadStarted?.(event.thread_id);
        threadId = event.thread_id;
        generatedImagesPath = join(this.generatedImagesDirectory, event.thread_id);
        imagesBeforeTurn = await generatedImageNames(generatedImagesPath);
      } else if (
        event.type === "item.completed" &&
        event.item.type === "agent_message"
      ) {
        finalResponse = event.item.text;
      } else if (
        event.type === "item.completed" &&
        event.item.type === "mcp_tool_call" &&
        event.item.status === "completed"
      ) {
        attachments.push(...await imageAttachmentsFromContent(
          event.item.result?.content,
        ));
      } else if (event.type === "turn.failed") {
        throw new Error(event.error.message);
      }
    }

    if (generatedImagesPath !== undefined) {
      attachments.push(...await generatedImageAttachments(
        generatedImagesPath,
        imagesBeforeTurn,
      ));
    }

    return { finalResponse, attachments };
  }
}
