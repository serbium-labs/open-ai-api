import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createServerConfig, loadRootEnvironment, type RuntimePlatform } from "./index";

function runtime(platform: NodeJS.Platform, arch: NodeJS.Architecture, existingSuffixes: string[] = []): RuntimePlatform {
  return {
    platform,
    arch,
    exists: (path: string) => existingSuffixes.some((suffix) =>
      path.replaceAll("\\", "/").endsWith(suffix)),
  };
}

test("root .env loads without overriding existing environment values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "root-env-test-"));
  const environment: NodeJS.ProcessEnv = { SERVER_PORT: "4100" };

  try {
    await writeFile(join(directory, ".env"), "SERVER_PORT=4200\nWHISPER_LANGUAGE=ru\n");
    loadRootEnvironment(directory, environment);
    assert.equal(environment.SERVER_PORT, "4100");
    assert.equal(environment.WHISPER_LANGUAGE, "ru");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing root .env fails with an actionable error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "missing-root-env-test-"));

  try {
    assert.throws(
      () => loadRootEnvironment(directory, {}),
      /Missing required environment file: .*\.env.*Copy \.env\.example to \.env/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SERVER_PORT takes precedence over legacy PORT", () => {
  assert.equal(createServerConfig({ SERVER_PORT: "4001", PORT: "4002" }).port, 4001);
  assert.equal(createServerConfig({ PORT: "4002" }).port, 4002);
  assert.equal(createServerConfig({}).port, 3001);
});

test("explicitly configured server ports are validated", () => {
  for (const value of ["", "0", "65536", "1.5", "not-a-port"]) {
    assert.throws(() => createServerConfig({ SERVER_PORT: value }), /Invalid SERVER_PORT.*1 to 65535/);
  }
});

test("audio paths preserve command names, spaces, and explicit Whisper precedence", () => {
  const whisperExecutable = "C:\\Program Files\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe";
  const ffmpegExecutable = "C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe";
  const modelPath = "C:\\Whisper Models\\ggml-base.bin";
  const config = createServerConfig({
    FFMPEG_PATH: `  ${ffmpegExecutable}  `,
    WHISPER_CPP_PATH: `  ${whisperExecutable}  `,
    WHISPER_MODEL_PATH: `  ${modelPath}  `,
  }, runtime("win32", "x64", ["build-x64/bin/Release/whisper-cli.exe"]));

  assert.equal(config.audioTranscription.ffmpegExecutable, ffmpegExecutable);
  assert.equal(config.audioTranscription.whisperExecutable, whisperExecutable);
  assert.equal(config.audioTranscription.modelPath, modelPath);
  assert.equal(createServerConfig({ FFMPEG_PATH: "ffmpeg" }).audioTranscription.ffmpegExecutable, "ffmpeg");
});

test("project-relative executable paths resolve from the repository root", () => {
  const config = createServerConfig({
    FFMPEG_PATH: "tools/ffmpeg",
    WHISPER_CPP_PATH: "custom tools/whisper-cli",
  });

  assert.equal(config.audioTranscription.ffmpegExecutable, resolve(config.repositoryRoot, "tools/ffmpeg"));
  assert.equal(config.audioTranscription.whisperExecutable, resolve(config.repositoryRoot, "custom tools/whisper-cli"));
});

test("discovers Unix project-local whisper-cli before PATH", () => {
  const config = createServerConfig({}, runtime("linux", "x64", [
    ".local/whisper.cpp/build/bin/whisper-cli",
  ]));
  assert.equal(config.audioTranscription.whisperExecutable, resolve(config.repositoryRoot, ".local/whisper.cpp/build/bin/whisper-cli"));
});

test("discovers Windows x64 project-local whisper-cli", () => {
  const config = createServerConfig({}, runtime("win32", "x64", [
    ".local/whisper.cpp/build-x64/bin/Release/whisper-cli.exe",
  ]));
  assert.match(config.audioTranscription.whisperExecutable.replaceAll("\\", "/"), /build-x64\/bin\/Release\/whisper-cli\.exe$/);
});

test("Windows ARM64 prefers ARM64 and permits x64 fallback", () => {
  const armConfig = createServerConfig({}, runtime("win32", "arm64", [
    ".local/whisper.cpp/build-arm64/bin/Release/whisper-cli.exe",
    ".local/whisper.cpp/build-x64/bin/Release/whisper-cli.exe",
  ]));
  const fallbackConfig = createServerConfig({}, runtime("win32", "arm64", [
    ".local/whisper.cpp/build-x64/bin/Release/whisper-cli.exe",
  ]));

  assert.match(armConfig.audioTranscription.whisperExecutable.replaceAll("\\", "/"), /build-arm64\/bin\/Release\/whisper-cli\.exe$/);
  assert.match(fallbackConfig.audioTranscription.whisperExecutable.replaceAll("\\", "/"), /build-x64\/bin\/Release\/whisper-cli\.exe$/);
});

test("missing local binaries fall back to a PATH command", () => {
  assert.equal(createServerConfig({}, runtime("linux", "x64")).audioTranscription.whisperExecutable, "whisper-cli");
  assert.equal(createServerConfig({}, runtime("win32", "x64")).audioTranscription.whisperExecutable, "whisper-cli.exe");
});

test("WHISPER_LANGUAGE defaults and overrides are normalized", () => {
  for (const [value, expected] of [
    [undefined, "auto"],
    ["   ", "auto"],
    [" ru ", "ru"],
    ["EN", "en"],
    [" pt-BR ", "pt-br"],
  ] as const) {
    assert.equal(createServerConfig({ WHISPER_LANGUAGE: value }).audioTranscription.language, expected);
  }
});

test("audio configuration retains model and PATH-based defaults", () => {
  const config = createServerConfig({}, runtime("linux", "x64"));
  assert.equal(config.audioTranscription.ffmpegExecutable, "ffmpeg");
  assert.equal(config.audioTranscription.whisperExecutable, "whisper-cli");
  assert.equal(config.audioTranscription.modelPath, resolve(config.repositoryRoot, "models/ggml-base.bin"));
});
