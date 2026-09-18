import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  createServer,
  ensureCodeWorkspace,
  readCodeWorkspace,
  runCodex,
  saveCodexResponse,
} from "./server.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createTemporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "codex-workspace-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function request(server, path, options) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, options);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function postPrompt(server, prompt = "Edit the code") {
  return request(server, "/api/codex", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

test("ensureCodeWorkspace creates the workspace and preserves existing files", async () => {
  const parent = await createTemporaryDirectory();
  const workspace = join(parent, "code-to-edit");

  await ensureCodeWorkspace(workspace);
  await writeFile(join(workspace, "existing.js"), "const value = 1;", "utf8");
  await ensureCodeWorkspace(workspace);

  assert.deepEqual(await readdir(workspace), ["existing.js"]);
  assert.equal(await readFile(join(workspace, "existing.js"), "utf8"), "const value = 1;");
});

test("readCodeWorkspace returns sorted nested UTF-8 files and omits non-text files", async () => {
  const workspace = join(await createTemporaryDirectory(), "code-to-edit");
  await mkdir(join(workspace, "nested"), { recursive: true });
  await writeFile(join(workspace, "z.js"), "console.log('z');", "utf8");
  await writeFile(join(workspace, "nested", "a.js"), "const message = 'Привет';", "utf8");
  await writeFile(join(workspace, "binary.bin"), Buffer.from([0xff, 0xfe, 0xfd]));

  assert.deepEqual(await readCodeWorkspace(workspace), [
    { path: "nested/a.js", content: "const message = 'Привет';" },
    { path: "z.js", content: "console.log('z');" },
  ]);
});

test("readCodeWorkspace returns an empty list for an empty workspace", async () => {
  const workspace = join(await createTemporaryDirectory(), "code-to-edit");

  assert.deepEqual(await readCodeWorkspace(workspace), []);
});

test("readCodeWorkspace does not follow symbolic links", async () => {
  const parent = await createTemporaryDirectory();
  const workspace = join(parent, "code-to-edit");
  const outsideFile = join(parent, "outside.txt");
  await mkdir(workspace);
  await writeFile(outsideFile, "secret", "utf8");
  await symlink(outsideFile, join(workspace, "linked.txt"));

  assert.deepEqual(await readCodeWorkspace(workspace), []);
});

test("runCodex scopes the thread and asks Codex to edit files directly", async () => {
  const calls = {};

  class FakeCodex {
    startThread(options) {
      calls.options = options;
      return {
        run: async (prompt) => {
          calls.prompt = prompt;
          return { finalResponse: "Files updated" };
        },
      };
    }
  }

  const result = await runCodex("Rename the function", {
    CodexClient: FakeCodex,
    workingDirectory: "/tmp/code-to-edit",
  });

  assert.equal(result, "Files updated");
  assert.deepEqual(calls.options, {
    workingDirectory: "/tmp/code-to-edit",
    sandboxMode: "workspace-write",
    skipGitRepoCheck: true,
  });
  assert.match(calls.prompt, /apply the requested edits on disk/);
  assert.match(calls.prompt, /User request:\nRename the function$/);
});

test("GET /api/code returns the workspace snapshot", async () => {
  const files = [{ path: "app.js", content: "export default 1;" }];
  const server = createServer({ readWorkspace: async () => files });

  const response = await request(server, "/api/code");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { files });
});

test("GET /api/code returns an empty snapshot", async () => {
  const server = createServer({ readWorkspace: async () => [] });

  const response = await request(server, "/api/code");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { files: [] });
});

test("GET /api/code reports workspace read errors", async () => {
  const server = createServer({
    readWorkspace: async () => {
      throw new Error("Workspace unavailable");
    },
  });

  const response = await request(server, "/api/code");

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Workspace unavailable" });
});

test("static file routing still serves the browser page", async () => {
  const server = createServer();

  const response = await request(server, "/");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.match(await response.text(), /Codex Browser Test/);
});

test("POST /api/codex persists before returning the existing response shape", async () => {
  const events = [];
  const server = createServer({
    runCodex: async (prompt) => {
      assert.equal(prompt, "Edit the code");
      events.push("codex");
      return "Done";
    },
    saveResponse: async (answer) => {
      assert.equal(answer, "Done");
      events.push("saved");
    },
  });

  const response = await postPrompt(server);
  events.push("received");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { finalResponse: "Done" });
  assert.deepEqual(events, ["codex", "saved", "received"]);
});

test("POST /api/codex rejects an empty prompt without running Codex", async () => {
  let runs = 0;
  let saves = 0;
  const server = createServer({
    runCodex: async () => {
      runs += 1;
    },
    saveResponse: async () => {
      saves += 1;
    },
  });

  const response = await postPrompt(server, "   ");

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Prompt is required" });
  assert.equal(runs, 0);
  assert.equal(saves, 0);
});

test("POST /api/codex does not persist when Codex fails", async () => {
  let saves = 0;
  const server = createServer({
    runCodex: async () => {
      throw new Error("Codex failed");
    },
    saveResponse: async () => {
      saves += 1;
    },
  });

  const response = await postPrompt(server);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Codex failed" });
  assert.equal(saves, 0);
});

test("POST /api/codex returns an error when response persistence fails", async () => {
  const server = createServer({
    runCodex: async () => "Changed code",
    saveResponse: async () => {
      throw new Error("Storage failed");
    },
  });

  const response = await postPrompt(server);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Storage failed" });
});

test("saveCodexResponse still writes exact content to a unique Markdown file", async () => {
  const directory = join(await createTemporaryDirectory(), "responses");
  const response = "# Ответ\n\nГотово.";

  const filePath = await saveCodexResponse(response, {
    directory,
    now: () => new Date("2026-09-18T10:11:12.345Z"),
    createId: () => "test-id",
  });

  assert.equal(
    filePath,
    join(directory, "2026-09-18T10-11-12-345Z_test-id.md"),
  );
  assert.equal(await readFile(filePath, "utf8"), response);
});
