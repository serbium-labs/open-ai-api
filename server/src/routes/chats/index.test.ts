import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { processChatMessage } from "./index";
import { ChatArchiveService } from "#services/chat-archive";
import type { CodexService } from "#services/codex";
import type { AudioTranscriber } from "#services/audio-transcription";

type FakeCodex = {
  prompts: string[];
  run(prompt: string): Promise<string>;
};

function uploadedFile(
  path: string,
  originalname: string,
  mimetype: string,
  size: number,
): Express.Multer.File {
  return {
    path,
    originalname,
    mimetype,
    size,
  } as Express.Multer.File;
}

test("voice uploads are transcribed before Codex and archived with byte-accurate metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "voice-route-test-"));
  const archive = new ChatArchiveService(directory);
  const chat = await archive.createChat();
  const uploadPath = join(directory, "voice-upload");
  const audioBytes = Buffer.from(
    [0x4f, 0x67, 0x67, 0x53, 0, 1, 2, 3],
  );
  await writeFile(uploadPath, audioBytes);
  const codex: FakeCodex = {
    prompts: [],
    async run(prompt: string): Promise<string> {
      this.prompts.push(prompt);
      return "It contains a TypeScript application.";
    },
  };
  let transcribedBytes = "";
  const transcriber: AudioTranscriber = {
    async transcribe({ path }): Promise<string> {
      transcribedBytes = (await readFile(path)).toString("latin1");
      return "What is in this repository?";
    },
  };

  try {
    const result = await processChatMessage({
      audioTranscriber: transcriber,
      chatArchiveService: archive,
      chatId: chat.id,
      codexService: codex as unknown as CodexService,
      file: uploadedFile(
        uploadPath,
        "voice-message.webm",
        "audio/webm",
        audioBytes.length,
      ),
      prompt: "",
    });

    assert.equal(transcribedBytes.startsWith("OggS"), true);
    assert.equal(
      codex.prompts[0],
      "Voice message transcript:\nWhat is in this repository?",
    );
    assert.equal(
      result.chat.messages[0]?.content,
      "Voice message transcript:\nWhat is in this repository?",
    );
    assert.deepEqual(
      result.chat.messages[0]?.attachments.map(
        ({ name, mimeType }) => ({ name, mimeType }),
      ),
      [{ name: "voice-message.ogg", mimeType: "audio/ogg" }],
    );
    assert.match(
      result.chat.messages[0]?.attachments[0]?.path ?? "",
      /\.ogg$/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a transcription failure is returned clearly and is not sent to Codex", async () => {
  const directory = await mkdtemp(join(tmpdir(), "voice-route-test-"));
  const archive = new ChatArchiveService(directory);
  const chat = await archive.createChat();
  const uploadPath = join(directory, "voice-upload");
  await writeFile(uploadPath, "OggSfixture", "latin1");
  const codex: FakeCodex = {
    prompts: [],
    async run(prompt: string): Promise<string> {
      this.prompts.push(prompt);
      return "should not run";
    },
  };
  const transcriber: AudioTranscriber = {
    async transcribe(): Promise<string> {
      throw new Error(
        "Local Whisper model not found: models/ggml-base.en.bin",
      );
    },
  };

  try {
    await assert.rejects(
      processChatMessage({
        audioTranscriber: transcriber,
        chatArchiveService: archive,
        chatId: chat.id,
        codexService: codex as unknown as CodexService,
        file: uploadedFile(
          uploadPath,
          "voice.webm",
          "audio/webm",
          11,
        ),
        prompt: "",
      }),
      /local Whisper model not found/i,
    );
    assert.deepEqual(codex.prompts, []);
    assert.deepEqual((await archive.loadChat(chat.id)).messages, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ordinary file attachments bypass transcription and keep their existing Codex instruction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "file-route-test-"));
  const archive = new ChatArchiveService(directory);
  const chat = await archive.createChat();
  const uploadPath = join(directory, "text-upload");
  await writeFile(uploadPath, "ordinary text");
  const codex: FakeCodex = {
    prompts: [],
    async run(prompt: string): Promise<string> {
      this.prompts.push(prompt);
      return "I inspected the file.";
    },
  };
  let transcriptionCalls = 0;
  const transcriber: AudioTranscriber = {
    async transcribe(): Promise<string> {
      transcriptionCalls += 1;
      return "unexpected";
    },
  };

  try {
    await processChatMessage({
      audioTranscriber: transcriber,
      chatArchiveService: archive,
      chatId: chat.id,
      codexService: codex as unknown as CodexService,
      file: uploadedFile(
        uploadPath,
        "notes.txt",
        "text/plain",
        13,
      ),
      prompt: "Summarize this",
    });

    assert.equal(transcriptionCalls, 0);
    assert.match(codex.prompts[0] ?? "", /Summarize this/);
    assert.match(codex.prompts[0] ?? "", /Name: notes\.txt/);
    assert.match(
      codex.prompts[0] ?? "",
      /Inspect this file when answering the user\./,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
