import { spawn } from "node:child_process";

export type AudioDurationReader = {
  readDurationSeconds(path: string): Promise<number>;
};

type AudioDurationServiceDependencies = {
  ffmpegExecutable: string;
  timeoutMs: number;
};

export class AudioDurationService implements AudioDurationReader {
  public constructor(
    private readonly dependencies: AudioDurationServiceDependencies,
  ) {}

  public readDurationSeconds(path: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const child = spawn(
        this.dependencies.ffmpegExecutable,
        [
          "-v", "error",
          "-i", path,
          "-map", "0:a:0",
          "-f", "null",
          "-progress", "pipe:1",
          "-",
        ],
        { shell: false, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      let diagnostic = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill("SIGKILL");
          reject(new Error("FFmpeg audio duration inspection timed out"));
        }
      }, this.dependencies.timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        diagnostic = `${diagnostic}${chunk}`.slice(-4_000);
      });
      child.on("error", (error: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      });
      child.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (code !== 0) {
          reject(new Error(
            `FFmpeg could not inspect audio duration (exit ${code ?? "unknown"})${
              diagnostic.trim() === "" ? "" : `: ${diagnostic.trim()}`
            }`,
          ));
          return;
        }

        const durations = [...output.matchAll(/^out_time_us=(\d+)$/gm)];
        const microseconds = Number(durations.at(-1)?.[1]);
        const durationSeconds = microseconds / 1_000_000;

        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          reject(new Error("FFmpeg did not report a valid audio duration"));
          return;
        }

        resolve(durationSeconds);
      });
    });
  }
}
