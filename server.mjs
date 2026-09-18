import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Codex } from "@openai/codex-sdk";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3001);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

export async function runCodex(prompt) {
  const codex = new Codex();
  const thread = codex.startThread({
    skipGitRepoCheck: true,
  });
  const result = await thread.run(prompt);
  return result.finalResponse;
}

export function createServer({ runCodex: runCodexImpl = runCodex } = {}) {
  return createHttpServer(async (request, response) => {
    try {
      if (request.method === "POST" && request.url === "/api/codex") {
        await handleCodexRequest(request, response, runCodexImpl);
        return;
      }

      if (request.method === "GET") {
        await serveStatic(request, response);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unexpected server error",
      });
    }
  });
}

async function handleCodexRequest(request, response, runCodexImpl) {
  const body = await readJsonBody(request);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    sendJson(response, 400, { error: "Prompt is required" });
    return;
  }

  const finalResponse = await runCodexImpl(prompt);
  sendJson(response, 200, { finalResponse });
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(request, response) {
  const requestedPath = new URL(request.url, "http://localhost").pathname;
  const filePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const absolutePath = join(root, filePath);
  const indexPath = join(root, "index.html");

  if (!absolutePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    await readFile(absolutePath);
  } catch {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes.get(extname(absolutePath)) || "application/octet-stream",
  });
  createReadStream(absolutePath === root ? indexPath : absolutePath).pipe(response);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

