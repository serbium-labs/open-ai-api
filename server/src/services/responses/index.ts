import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { MARKDOWN_EXTENSION, UTF8_ENCODING } from "../../constants/index.js";

export type ResponseStorageDependencies = {
  directory: string;
  now?: () => Date;
  createId?: () => string;
};

export class ResponseStorage {
  private readonly directory: string;
  private readonly now: () => Date;
  private readonly createId: () => string;

  public constructor({
    directory,
    now = () => new Date(),
    createId = randomUUID,
  }: ResponseStorageDependencies) {
    this.directory = directory;
    this.now = now;
    this.createId = createId;
  }

  public async save(finalResponse: string): Promise<string> {
    const timestamp: string = this.now().toISOString().replace(/[:.]/g, "-");
    const fileName: string = `${timestamp}_${this.createId()}${MARKDOWN_EXTENSION}`;
    const filePath: string = join(this.directory, fileName);

    await mkdir(this.directory, { recursive: true });
    await writeFile(filePath, finalResponse, { encoding: UTF8_ENCODING, flag: "wx" });

    return filePath;
  }
}
