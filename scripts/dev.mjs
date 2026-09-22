import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stateFilePath = resolve(".dev-server-pids.json");
const processes = [
  { name: "server", args: ["--prefix", "server", "run", "dev"] },
  { name: "client", args: ["--prefix", "client", "run", "dev"] },
];
const children = [];
let isStopping = false;

function startProcess({ name, args }) {
  const command = process.platform === "win32" ? "cmd.exe" : npmCommand;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", npmCommand, ...args] : args;
  const child = spawn(command, commandArgs, {
    stdio: "inherit",
    detached: process.platform !== "win32",
  });

  child.on("exit", (code, signal) => {
    if (signal !== null) {
      console.log(`${name} stopped with signal ${signal}`);
      finishIfAllChildrenExited();
      return;
    }

    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      stopChildren();
      process.exitCode = code ?? 1;
    }

    finishIfAllChildrenExited();
  });

  return child;
}

function finishIfAllChildrenExited() {
  setImmediate(() => {
    const allExited = children.every((child) => child.exitCode !== null || child.signalCode !== null);

    if (allExited) {
      process.exit(process.exitCode ?? 0);
    }
  });
}

async function writeStateFile() {
  await writeFile(
    stateFilePath,
    `${JSON.stringify(
      {
        rootPid: process.pid,
        wrapperPid: process.env.npm_lifecycle_event === "dev" ? process.ppid : undefined,
        startedAt: new Date().toISOString(),
        processes: children
          .filter((child) => child.pid !== undefined)
          .map((child, index) => ({
            name: processes[index].name,
            pid: child.pid,
            command: process.platform === "win32" ? "cmd.exe" : npmCommand,
            args: process.platform === "win32"
              ? ["/d", "/s", "/c", npmCommand, ...processes[index].args]
              : processes[index].args,
          })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function stopChildren() {
  if (isStopping) {
    return;
  }

  isStopping = true;

  for (const child of children) {
    if (!child.killed) {
      if (process.platform === "win32") {
        child.kill();
        continue;
      }

      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
    }
  }
}

process.on("SIGINT", () => {
  stopChildren();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopChildren();
  process.exit(143);
});

for (const processConfig of processes) {
  children.push(startProcess(processConfig));
}

await writeStateFile();
console.log(`Development server PIDs written to ${stateFilePath}`);
