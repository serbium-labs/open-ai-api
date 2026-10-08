import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

export type AudioFormat = {
  extension: "flac" | "m4a" | "mp3" | "ogg" | "wav" | "webm";
  mimeType:
    | "audio/flac"
    | "audio/mp4"
    | "audio/mpeg"
    | "audio/ogg"
    | "audio/wav"
    | "audio/webm";
};

export type NormalizedAudioUpload = AudioFormat & {
  originalName: string;
};

const AUDIO_EXTENSIONS = new Set([
  ".flac",
  ".m4a",
  ".mp3",
  ".mp4",
  ".oga",
  ".ogg",
  ".wav",
  ".webm",
]);

function startsWith(bytes: Buffer, signature: readonly number[]): boolean {
  return signature.every(
    (value: number, index: number) => bytes[index] === value,
  );
}

export function detectAudioFormat(bytes: Buffer): AudioFormat | undefined {
  if (startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])) {
    return { extension: "ogg", mimeType: "audio/ogg" };
  }

  if (
    startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) &&
    bytes.toString("latin1").toLowerCase().includes("webm")
  ) {
    return { extension: "webm", mimeType: "audio/webm" };
  }

  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 4, 8) === "ftyp"
  ) {
    return { extension: "m4a", mimeType: "audio/mp4" };
  }

  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  ) {
    return { extension: "wav", mimeType: "audio/wav" };
  }

  if (bytes.toString("ascii", 0, 4) === "fLaC") {
    return { extension: "flac", mimeType: "audio/flac" };
  }

  if (
    bytes.toString("ascii", 0, 3) === "ID3" ||
    (bytes.length >= 2 &&
      bytes[0] === 0xff &&
      (bytes[1] & 0xe0) === 0xe0)
  ) {
    return { extension: "mp3", mimeType: "audio/mpeg" };
  }

  return undefined;
}

export function looksLikeAudioUpload(
  originalName: string,
  declaredMimeType: string,
): boolean {
  return (
    declaredMimeType.toLowerCase().startsWith("audio/") ||
    AUDIO_EXTENSIONS.has(extname(originalName).toLowerCase())
  );
}

export async function inspectAudioUpload(
  path: string,
  originalName: string,
): Promise<NormalizedAudioUpload> {
  const file = await readFile(path);
  const format = detectAudioFormat(file.subarray(0, 4096));

  if (format === undefined) {
    throw new Error(
      "Unsupported or invalid audio file. Supported formats are WebM, Ogg, M4A/MP4, WAV, MP3, and FLAC.",
    );
  }

  const parsedBaseName = basename(
    originalName,
    extname(originalName),
  ).trim();
  const safeBaseName = parsedBaseName === ""
    ? "voice-message"
    : parsedBaseName;

  return {
    ...format,
    originalName: `${safeBaseName}.${format.extension}`,
  };
}
