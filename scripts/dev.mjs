import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const shouldUseShell = process.platform === "win32";
const processes = [
  { name: "server", args: ["--prefix", "server", "run", "dev"] },
  { name: "client", args: ["--prefix", "client", "run", "dev"] },
];

function startProcess({ name, args }) {
  const child = spawn(npmCommand, args, {
    stdio: "inherit",
    shell: shouldUseShell,
  });

  child.on("exit", (code, signal) => {
    if (signal !== null) {
      console.log(`${name} stopped with signal ${signal}`);
      return;
    }

    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      stopChildren();
      process.exitCode = code ?? 1;
    }
  });

  return child;
}

const children = processes.map(startProcess);

function stopChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
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
