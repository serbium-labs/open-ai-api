import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, posix, relative, sep } from "node:path";
import { UTF8_ENCODING } from "#constants";
import type { CodeFile } from "#models";
import { WorkspaceService } from "#services/workspace";

export type OutputCodeChunk = {
  content: string;
  language: string | undefined;
  path: string | undefined;
};

const FENCE_PATTERN: RegExp = /```([^\r\n`]*)\r?\n([\s\S]*?)\r?\n```/g;
const LANGUAGE_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["javascript", "js"],
  ["js", "js"],
  ["jsx", "jsx"],
  ["typescript", "ts"],
  ["ts", "ts"],
  ["tsx", "tsx"],
  ["json", "json"],
  ["css", "css"],
  ["html", "html"],
  ["md", "md"],
  ["markdown", "md"],
]);

function normalizeFenceContent(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

function isPathHint(value: string): boolean {
  return value.includes("/") || value.includes("\\") || /\.[A-Za-z0-9]+$/.test(value);
}

function parseFenceInfo(info: string): Pick<OutputCodeChunk, "language" | "path"> {
  const parts: string[] = info.trim().split(/\s+/).filter(Boolean);
  let language: string | undefined;
  let path: string | undefined;

  for (const part of parts) {
    if (path === undefined && isPathHint(part)) {
      path = part.replace(/\\/g, "/");
      continue;
    }

    if (language === undefined) {
      language = part.toLowerCase();
    }
  }

  return { language, path };
}

function extensionForLanguage(language: string | undefined): string {
  if (language === undefined) {
    return "txt";
  }

  return LANGUAGE_EXTENSIONS.get(language.toLowerCase()) ?? "txt";
}

function generatedPath(index: number, language: string | undefined): string {
  return `output-${String(index).padStart(3, "0")}.${extensionForLanguage(language)}`;
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
    throw new Error(`Unsafe output path: ${path}`);
  }
}

export function extractOutputCodeChunks(response: string): OutputCodeChunk[] {
  const chunks: OutputCodeChunk[] = [];

  for (const match of response.matchAll(FENCE_PATTERN)) {
    const { language, path } = parseFenceInfo(match[1] ?? "");
    const content: string = normalizeFenceContent(match[2] ?? "");

    chunks.push({ content, language, path });
  }

  return chunks;
}

export class OutputCodeService {
  public constructor(private readonly directory: string) {}

  public async saveResponseChunks(response: string): Promise<CodeFile[]> {
    const chunks: OutputCodeChunk[] = extractOutputCodeChunks(response);
    const plannedFiles: CodeFile[] = [];
    const paths: Set<string> = new Set();

    for (let index: number = 0; index < chunks.length; index += 1) {
      const chunk: OutputCodeChunk = chunks[index];
      const content: string = chunk.content.trimEnd();

      if (content.trim() === "") {
        throw new Error("Empty output chunk");
      }

      const outputPath: string = chunk.path ?? generatedPath(index + 1, chunk.language);
      assertSafeRelativePath(outputPath);

      const relativePath: string = normalize(outputPath);
      const listPath: string = relativePath.split(sep).join(posix.sep);

      if (paths.has(listPath)) {
        throw new Error(`Duplicate output path: ${listPath}`);
      }

      paths.add(listPath);
      plannedFiles.push({ path: listPath, content });
    }

    await rm(this.directory, { recursive: true, force: true });
    await mkdir(this.directory, { recursive: true });

    for (const file of plannedFiles) {
      const absolutePath: string = join(this.directory, file.path);
      const relativeToRoot: string = relative(this.directory, absolutePath);

      assertSafeRelativePath(relativeToRoot);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content, { encoding: UTF8_ENCODING, flag: "wx" });
    }

    plannedFiles.sort((left: CodeFile, right: CodeFile) => left.path.localeCompare(right.path));

    return plannedFiles;
  }

  public async readOutputWorkspace(): Promise<CodeFile[]> {
    return new WorkspaceService(this.directory).readCodeWorkspace();
  }
}
