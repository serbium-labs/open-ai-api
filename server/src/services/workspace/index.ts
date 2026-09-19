import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { TextDecoder } from "node:util";

import { UTF8_ENCODING } from "#constants";
import type { CodeFile } from "#models";

export class WorkspaceService {
  public constructor(private readonly directory: string) {}

  public async ensureWorkspace(): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    return this.directory;
  }

  public async readCodeWorkspace(): Promise<CodeFile[]> {
    await this.ensureWorkspace();

    const files: CodeFile[] = [];
    await this.collectTextFiles(this.directory, "", files);
    files.sort((left: CodeFile, right: CodeFile) => left.path.localeCompare(right.path));

    return files;
  }

  private async collectTextFiles(
    directory: string,
    relativeDirectory: string,
    files: CodeFile[],
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const relativePath: string = relativeDirectory
        ? posix.join(relativeDirectory, entry.name)
        : entry.name;
      const absolutePath: string = join(directory, entry.name);

      if (entry.isDirectory()) {
        await this.collectTextFiles(absolutePath, relativePath, files);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const contents: Buffer = await readFile(absolutePath);

      try {
        files.push({
          path: relativePath,
          content: new TextDecoder(UTF8_ENCODING, { fatal: true }).decode(contents),
        });
      } catch (error: unknown) {
        if (!(error instanceof TypeError)) {
          throw error;
        }
      }
    }
  }
}
