import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { WorkspaceService } from "./index.js";

test("WorkspaceService returns sorted UTF-8 text files and skips binary files", async () => {
  const rootDirectory: string = await mkdtemp(join(tmpdir(), "workspace-service-"));
  const nestedDirectory: string = join(rootDirectory, "src");

  await mkdir(nestedDirectory, { recursive: true });
  await writeFile(join(rootDirectory, "b.txt"), "second", "utf8");
  await writeFile(join(nestedDirectory, "a.ts"), "first", "utf8");
  await writeFile(join(rootDirectory, "binary.bin"), Buffer.from([0xff, 0xfe, 0xfd]));

  const service: WorkspaceService = new WorkspaceService(rootDirectory);
  const files = await service.readCodeWorkspace();

  assert.deepEqual(files, [
    { path: "b.txt", content: "second" },
    { path: "src/a.ts", content: "first" },
  ]);
});

test("WorkspaceService skips symbolic links", async (context: TestContext) => {
  const rootDirectory: string = await mkdtemp(join(tmpdir(), "workspace-service-"));
  const targetFile: string = join(rootDirectory, "target.txt");

  await writeFile(targetFile, "target", "utf8");

  try {
    await symlink(targetFile, join(rootDirectory, "linked.txt"));
  } catch (error: unknown) {
    const code: string | undefined = error instanceof Error && "code" in error
      ? String(error.code)
      : undefined;

    if (code === "EPERM") {
      context.skip("Current OS user cannot create symbolic links.");
      return;
    }

    throw error;
  }

  const service: WorkspaceService = new WorkspaceService(rootDirectory);
  const files = await service.readCodeWorkspace();

  assert.deepEqual(files, [{ path: "target.txt", content: "target" }]);
});
