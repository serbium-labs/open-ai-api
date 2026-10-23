import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createViteConfig, resolveVitePorts } from "../vite.config";

test("Vite ports use defaults and SERVER_PORT precedence", () => {
  assert.deepEqual(resolveVitePorts({}), { clientPort: 5173, serverPort: 3001 });
  assert.deepEqual(resolveVitePorts({
    CLIENT_PORT: "5174",
    PORT: "3002",
    SERVER_PORT: "3003",
  }), { clientPort: 5174, serverPort: 3003 });
});

test("Vite supports the legacy PORT server alias", () => {
  assert.equal(resolveVitePorts({ PORT: "3010" }).serverPort, 3010);
});

test("Vite uses the resolved server port for its strict-port proxy", () => {
  const config = createViteConfig({ CLIENT_PORT: "5200", SERVER_PORT: "3100" });
  const proxy = config.server?.proxy?.["/api"];

  assert.equal(config.server?.port, 5200);
  assert.equal(config.server?.strictPort, true);
  assert.equal(
    typeof proxy === "string" ? proxy : proxy?.target,
    "http://localhost:3100",
  );
});

test("Vite rejects invalid explicitly configured ports", () => {
  assert.throws(() => resolveVitePorts({ CLIENT_PORT: "65536" }), /Invalid CLIENT_PORT.*1 to 65535/);
  assert.throws(() => resolveVitePorts({ SERVER_PORT: "not-a-port" }), /Invalid SERVER_PORT.*1 to 65535/);
});

test("Vite proxy returns a JSON error while the API server is unavailable", () => {
  const config = createViteConfig({});
  const proxyOptions = config.server?.proxy?.["/api"];

  assert.notEqual(typeof proxyOptions, "string");
  assert.ok(proxyOptions && typeof proxyOptions !== "string");

  const proxy = new EventEmitter();
  proxyOptions.configure?.(proxy as never, proxyOptions);

  let status: number | undefined;
  let headers: Record<string, string> | undefined;
  let body: string | undefined;
  const response = {
    headersSent: false,
    writableEnded: false,
    writeHead(nextStatus: number, nextHeaders: Record<string, string>) {
      status = nextStatus;
      headers = nextHeaders;
      return this;
    },
    end(nextBody: string) {
      body = nextBody;
      this.writableEnded = true;
    },
  };

  proxy.emit("error", new Error("connect ECONNREFUSED"), {}, response);

  assert.equal(status, 503);
  assert.deepEqual(headers, { "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(body ?? ""), { error: "Server is starting..." });
});
