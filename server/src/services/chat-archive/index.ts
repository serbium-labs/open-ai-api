import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, posix, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";

import { MARKDOWN_EXTENSION, UTF8_ENCODING } from "#constants";
import type { ChatDetail, ChatMessage, ChatResource, ChatRole, ChatSummary } from "#models";
import { extractOutputCodeChunks, type OutputCodeChunk } from "#services/output-code";

type Metadata = Record<string, string | string[] | undefined>;

type StoredChatLocation = {
  directory: string;
  summary: ChatSummary;
};

const FRONTMATTER_DELIMITER = "---";
const META_EXTENSION = ".meta.md";
const DEFAULT_TITLE = "New chat";
const LANGUAGE_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["bash", "sh"],
  ["css", "css"],
  ["html", "html"],
  ["javascript", "js"],
  ["js", "js"],
  ["json", "json"],
  ["jsx", "jsx"],
  ["markdown", "md"],
  ["md", "md"],
  ["python", "py"],
  ["py", "py"],
  ["shell", "sh"],
  ["sh", "sh"],
  ["typescript", "ts"],
  ["ts", "ts"],
  ["tsx", "tsx"],
]);

function isoTimestamp(): string {
  return new Date().toISOString();
}

function fileTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function titleFromPrompt(prompt: string): string {
  const normalized: string = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 54 ? `${normalized.slice(0, 54).trim()}...` : normalized || DEFAULT_TITLE;
}

function isPathHint(value: string): boolean {
  return value.includes("/") || value.includes("\\") || /\.[A-Za-z0-9]+$/.test(value);
}

function extensionForLanguage(language: string | undefined): string {
  if (language === undefined) {
    return "txt";
  }

  return LANGUAGE_EXTENSIONS.get(language.toLowerCase()) ?? "txt";
}

function assertSafeRelativePath(path: string): void {
  const normalized: string = normalize(path);
  const pathSegments: string[] = path.replace(/\\/g, "/").split("/");

  if (
    path.trim() === "" ||
    isAbsolute(path) ||
    pathSegments.includes("..") ||
    normalized === ".." ||
    normalized.startsWith(`..${sep}`) ||
    normalized.includes(`${sep}..${sep}`)
  ) {
    throw new Error(`Unsafe archive path: ${path}`);
  }
}

function safeResourcePath(chunk: OutputCodeChunk, ordinal: number, index: number): string {
  const rawPath: string =
    chunk.path ?? `${String(ordinal).padStart(3, "0")}-assistant__${String(index).padStart(3, "0")}.${extensionForLanguage(chunk.language)}`;
  const normalizedPath: string = normalize(rawPath.replace(/\\/g, "/"));

  assertSafeRelativePath(normalizedPath);
  return normalizedPath.split(sep).join(posix.sep);
}

function formatFrontmatter(metadata: Metadata, body: string): string {
  const lines: string[] = [FRONTMATTER_DELIMITER];

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
      continue;
    }

    lines.push(`${key}: ${value}`);
  }

  lines.push(FRONTMATTER_DELIMITER, body);
  return `${lines.join("\n")}\n`;
}

function parseFrontmatter(fileContent: string): { metadata: Metadata; body: string } | undefined {
  const normalized: string = fileContent.replace(/\r\n/g, "\n");

  if (!normalized.startsWith(`${FRONTMATTER_DELIMITER}\n`)) {
    return undefined;
  }

  const endIndex: number = normalized.indexOf(`\n${FRONTMATTER_DELIMITER}\n`, FRONTMATTER_DELIMITER.length + 1);

  if (endIndex === -1) {
    return undefined;
  }

  const frontmatter: string = normalized.slice(FRONTMATTER_DELIMITER.length + 1, endIndex);
  const body: string = normalized.slice(endIndex + FRONTMATTER_DELIMITER.length + 2);
  const metadata: Metadata = {};
  let arrayKey: string | undefined;

  for (const line of frontmatter.split("\n")) {
    if (line.trim() === "") {
      continue;
    }

    const arrayItem: RegExpMatchArray | null = line.match(/^\s+-\s*(.*)$/);

    if (arrayItem !== null && arrayKey !== undefined) {
      const value: string[] = Array.isArray(metadata[arrayKey]) ? metadata[arrayKey] : [];
      value.push(arrayItem[1]);
      metadata[arrayKey] = value;
      continue;
    }

    const keyValue: RegExpMatchArray | null = line.match(/^([^:]+):\s*(.*)$/);

    if (keyValue === null) {
      continue;
    }

    arrayKey = keyValue[1].trim();
    metadata[arrayKey] = keyValue[2] === "" ? [] : keyValue[2];
  }

  return { metadata, body: body.replace(/\n$/, "") };
}

function asString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asArray(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

function messageFileName(ordinal: number, role: ChatRole): string {
  return `${String(ordinal).padStart(3, "0")}-${role}${MARKDOWN_EXTENSION}`;
}

function resourceMetaPath(path: string): string {
  return `${path}${META_EXTENSION}`;
}

export class ChatArchiveService {
  public constructor(private readonly directory: string) {}

  public async listChats(): Promise<ChatSummary[]> {
    const locations: StoredChatLocation[] = await this.findChatLocations();
    return locations
      .map((location: StoredChatLocation) => location.summary)
      .sort((left: ChatSummary, right: ChatSummary) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public async createChat(title: string = DEFAULT_TITLE): Promise<ChatDetail> {
    const createdAt: string = isoTimestamp();
    const id: string = randomUUID();
    const date: string = createdAt.slice(0, 10);
    const chatDirectory: string = join(this.directory, date, `${fileTimestamp(createdAt)}_${id.slice(0, 8)}`);

    await mkdir(join(chatDirectory, "messages"), { recursive: true });
    await mkdir(join(chatDirectory, "resources"), { recursive: true });
    await this.writeChatMetadata(chatDirectory, {
      id,
      title: title.trim() || DEFAULT_TITLE,
      date,
      createdAt,
      updatedAt: createdAt,
    });

    return this.loadChat(id);
  }

  public async loadChat(chatId: string): Promise<ChatDetail> {
    const location: StoredChatLocation | undefined = await this.findChatLocation(chatId);

    if (location === undefined) {
      throw new Error("Chat not found");
    }

    const messages: ChatMessage[] = await this.readMessages(join(location.directory, "messages"));
    const resources: ChatResource[] = await this.readResources(join(location.directory, "resources"));

    return {
      ...location.summary,
      messages,
      resources,
    };
  }

  public async renameChat(chatId: string, title: string): Promise<ChatDetail> {
    const location: StoredChatLocation | undefined = await this.findChatLocation(chatId);

    if (location === undefined) {
      throw new Error("Chat not found");
    }

    const updatedSummary: ChatSummary = {
      ...location.summary,
      title: title.trim() || DEFAULT_TITLE,
      updatedAt: isoTimestamp(),
    };

    await this.writeChatMetadata(location.directory, updatedSummary);
    return this.loadChat(chatId);
  }

  public async appendExchange(chatId: string, prompt: string, finalResponse: string): Promise<ChatDetail> {
    await this.appendMessage(chatId, "user", prompt);
    return this.appendMessage(chatId, "assistant", finalResponse);
  }

  public async appendMessage(chatId: string, role: ChatRole, content: string): Promise<ChatDetail> {
    const location: StoredChatLocation | undefined = await this.findChatLocation(chatId);

    if (location === undefined) {
      throw new Error("Chat not found");
    }

    const messagesDirectory: string = join(location.directory, "messages");
    const resourcesDirectory: string = join(location.directory, "resources");
    const existingMessages: ChatMessage[] = await this.readMessages(messagesDirectory);
    const ordinal: number = existingMessages.length + 1;
    const message: ChatMessage = {
      id: randomUUID(),
      role,
      content,
      createdAt: isoTimestamp(),
      resources: [],
    };

    if (role === "assistant") {
      message.resources = await this.writeResources(resourcesDirectory, ordinal, message);
    }

    await this.writeMessage(messagesDirectory, ordinal, message);
    await this.writeChatMetadata(location.directory, {
      ...location.summary,
      title: existingMessages.length === 0 && role === "user" && location.summary.title === DEFAULT_TITLE
        ? titleFromPrompt(content)
        : location.summary.title,
      updatedAt: isoTimestamp(),
    });

    return this.loadChat(chatId);
  }

  private async findChatLocations(): Promise<StoredChatLocation[]> {
    await mkdir(this.directory, { recursive: true });

    const locations: StoredChatLocation[] = [];
    const dateEntries = await readdir(this.directory, { withFileTypes: true });

    for (const dateEntry of dateEntries) {
      if (!dateEntry.isDirectory()) {
        continue;
      }

      const dateDirectory: string = join(this.directory, dateEntry.name);
      const chatEntries = await readdir(dateDirectory, { withFileTypes: true });

      for (const chatEntry of chatEntries) {
        if (!chatEntry.isDirectory()) {
          continue;
        }

        const chatDirectory: string = join(dateDirectory, chatEntry.name);
        const summary: ChatSummary | undefined = await this.readChatSummary(chatDirectory, dateEntry.name);

        if (summary !== undefined) {
          locations.push({ directory: chatDirectory, summary });
        }
      }
    }

    return locations;
  }

  private async findChatLocation(chatId: string): Promise<StoredChatLocation | undefined> {
    const locations: StoredChatLocation[] = await this.findChatLocations();
    return locations.find((location: StoredChatLocation) => location.summary.id === chatId);
  }

  private async readChatSummary(chatDirectory: string, date: string): Promise<ChatSummary | undefined> {
    try {
      const content: string = await readFile(join(chatDirectory, "chat.md"), UTF8_ENCODING);
      const parsed = parseFrontmatter(content);

      if (parsed === undefined) {
        return undefined;
      }

      const id: string | undefined = asString(parsed.metadata.id);
      const title: string | undefined = asString(parsed.metadata.title);
      const createdAt: string | undefined = asString(parsed.metadata.createdAt);
      const updatedAt: string | undefined = asString(parsed.metadata.updatedAt);

      if (id === undefined || title === undefined || createdAt === undefined || updatedAt === undefined) {
        return undefined;
      }

      return { id, title, date, createdAt, updatedAt };
    } catch {
      return undefined;
    }
  }

  private async writeChatMetadata(chatDirectory: string, summary: ChatSummary): Promise<void> {
    await mkdir(chatDirectory, { recursive: true });
    await writeFile(
      join(chatDirectory, "chat.md"),
      formatFrontmatter(
        {
          id: summary.id,
          title: summary.title,
          date: summary.date,
          createdAt: summary.createdAt,
          updatedAt: summary.updatedAt,
        },
        `# ${summary.title}`,
      ),
      { encoding: UTF8_ENCODING },
    );
  }

  private async readMessages(messagesDirectory: string): Promise<ChatMessage[]> {
    try {
      const entries = (await readdir(messagesDirectory, { withFileTypes: true })).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      const messages: ChatMessage[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(MARKDOWN_EXTENSION)) {
          continue;
        }

        const content: string = await readFile(join(messagesDirectory, entry.name), UTF8_ENCODING);
        const parsed = parseFrontmatter(content);

        if (parsed === undefined) {
          continue;
        }

        const id: string | undefined = asString(parsed.metadata.id);
        const role: string | undefined = asString(parsed.metadata.role);
        const createdAt: string | undefined = asString(parsed.metadata.createdAt);

        if (id === undefined || (role !== "user" && role !== "assistant") || createdAt === undefined) {
          continue;
        }

        messages.push({
          id,
          role,
          createdAt,
          content: parsed.body,
          resources: asArray(parsed.metadata.resources),
        });
      }

      return messages;
    } catch {
      return [];
    }
  }

  private async writeMessage(messagesDirectory: string, ordinal: number, message: ChatMessage): Promise<void> {
    await mkdir(messagesDirectory, { recursive: true });
    await writeFile(
      join(messagesDirectory, messageFileName(ordinal, message.role)),
      formatFrontmatter(
        {
          id: message.id,
          role: message.role,
          createdAt: message.createdAt,
          ordinal: String(ordinal),
          resources: message.resources,
        },
        message.content,
      ),
      { encoding: UTF8_ENCODING },
    );
  }

  private async readResources(resourcesDirectory: string): Promise<ChatResource[]> {
    const files: string[] = await this.walkFiles(resourcesDirectory);
    const resources: ChatResource[] = [];

    for (const file of files) {
      if (file.endsWith(META_EXTENSION)) {
        continue;
      }

      const metaFile: string = resourceMetaPath(file);

      try {
        const metaContent: string = await readFile(join(resourcesDirectory, metaFile), UTF8_ENCODING);
        const parsed = parseFrontmatter(metaContent);

        if (parsed === undefined) {
          continue;
        }

        const id: string | undefined = asString(parsed.metadata.id);
        const messageId: string | undefined = asString(parsed.metadata.messageId);
        const createdAt: string | undefined = asString(parsed.metadata.createdAt);
        const language: string | undefined = asString(parsed.metadata.language);

        if (id === undefined || messageId === undefined || createdAt === undefined) {
          continue;
        }

        resources.push({
          id,
          messageId,
          createdAt,
          language,
          path: file,
          content: await readFile(join(resourcesDirectory, file), UTF8_ENCODING),
        });
      } catch {
        continue;
      }
    }

    return resources.sort((left: ChatResource, right: ChatResource) => left.path.localeCompare(right.path));
  }

  private async writeResources(
    resourcesDirectory: string,
    assistantOrdinal: number,
    message: ChatMessage,
  ): Promise<string[]> {
    const chunks: OutputCodeChunk[] = extractOutputCodeChunks(message.content);
    const resourceLinks: string[] = [];
    const usedPaths: Set<string> = new Set(await this.walkFiles(resourcesDirectory));

    await mkdir(resourcesDirectory, { recursive: true });

    for (let index: number = 0; index < chunks.length; index += 1) {
      const chunk: OutputCodeChunk = chunks[index];
      const content: string = chunk.content.trimEnd();

      if (content.trim() === "") {
        continue;
      }

      let resourcePath: string = safeResourcePath(chunk, assistantOrdinal, index + 1);
      const extension: string = resourcePath.includes(".") ? resourcePath.split(".").pop() ?? "txt" : "txt";
      const basePath: string = resourcePath.slice(0, -(extension.length + 1));
      let duplicateIndex = 2;

      while (usedPaths.has(resourcePath)) {
        resourcePath = `${basePath}-${duplicateIndex}.${extension}`;
        duplicateIndex += 1;
      }

      usedPaths.add(resourcePath);
      const absolutePath: string = join(resourcesDirectory, resourcePath);
      const relativeToRoot: string = relative(resourcesDirectory, absolutePath);

      assertSafeRelativePath(relativeToRoot);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, { encoding: UTF8_ENCODING });

      const metaPath: string = join(resourcesDirectory, resourceMetaPath(resourcePath));
      await mkdir(dirname(metaPath), { recursive: true });
      await writeFile(
        metaPath,
        formatFrontmatter(
          {
            id: randomUUID(),
            messageId: message.id,
            language: chunk.language,
            path: resourcePath,
            createdAt: isoTimestamp(),
            message: `../messages/${messageFileName(assistantOrdinal, "assistant")}`,
          },
          `[Message](../messages/${messageFileName(assistantOrdinal, "assistant")})`,
        ),
        { encoding: UTF8_ENCODING },
      );
      resourceLinks.push(`../resources/${resourcePath}`);
    }

    return resourceLinks;
  }

  private async walkFiles(rootDirectory: string, currentDirectory: string = rootDirectory): Promise<string[]> {
    try {
      const entries = await readdir(currentDirectory, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const absolutePath: string = join(currentDirectory, entry.name);

        if (entry.isDirectory()) {
          files.push(...(await this.walkFiles(rootDirectory, absolutePath)));
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        files.push(relative(rootDirectory, absolutePath).split(sep).join(posix.sep));
      }

      return files;
    } catch {
      return [];
    }
  }
}
