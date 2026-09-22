import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const stateFilePath = resolve(".dev-server-pids.json");

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopProcessTree(pid) {
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/pid", String(pid), "/t", "/f"]);
      return true;
    } catch {
      return false;
    }
  }

  if (!isProcessRunning(pid)) {
    return false;
  }

  try {
    process.kill(-pid, "SIGTERM");
    return true;
  } catch {
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }
}

async function readState() {
  try {
    return JSON.parse(await readFile(stateFilePath, "utf8"));
  } catch {
    return undefined;
  }
}

const state = await readState();

if (state === undefined || !Array.isArray(state.processes)) {
  console.log("No recorded dev server session found.");
  process.exit(0);
}

let stoppedCount = 0;

for (const entry of state.processes) {
  if (typeof entry?.pid !== "number") {
    continue;
  }

  const stopped = await stopProcessTree(entry.pid);

  if (stopped) {
    stoppedCount += 1;
    console.log(`Stopped ${entry.name ?? "process"} process tree at PID ${entry.pid}.`);
  }
}

if (typeof state.rootPid === "number" && state.rootPid !== process.pid) {
  const stopped = await stopProcessTree(state.rootPid);

  if (stopped) {
    stoppedCount += 1;
    console.log(`Stopped dev manager process tree at PID ${state.rootPid}.`);
  }
}

if (typeof state.wrapperPid === "number" && state.wrapperPid !== process.pid) {
  const stopped = await stopProcessTree(state.wrapperPid);

  if (stopped) {
    stoppedCount += 1;
    console.log(`Stopped npm wrapper process tree at PID ${state.wrapperPid}.`);
  }
}

await rm(stateFilePath, { force: true });

if (stoppedCount === 0) {
  console.log("No recorded dev server processes were running.");
} else {
  console.log(`Stopped ${stoppedCount} recorded dev server process tree${stoppedCount === 1 ? "" : "s"}.`);
}
