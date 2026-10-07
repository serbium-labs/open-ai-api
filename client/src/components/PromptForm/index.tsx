import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import { UI_TEXT } from "@constants";

export type PromptFormProps = {
  prompt: string;
  isRunning: boolean;
  onPromptChange: (prompt: string) => void;
  onSubmit: (
    prompt: string,
    attachment: File | null,
  ) => Promise<void>;
};

function getFileIcon(file: File): string {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  if (fileType.startsWith("image/")) {
    return "🖼️";
  }

  if (fileType.startsWith("audio/")) {
    return "🎤";
  }

  if (
    fileType === "application/pdf" ||
    fileName.endsWith(".pdf")
  ) {
    return "📕";
  }

  if (
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx")
  ) {
    return "📘";
  }

  if (
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".csv")
  ) {
    return "📊";
  }

  if (
    fileName.endsWith(".zip") ||
    fileName.endsWith(".rar") ||
    fileName.endsWith(".7z")
  ) {
    return "🗜️";
  }

  if (
    fileType.startsWith("text/") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".json") ||
    fileName.endsWith(".js") ||
    fileName.endsWith(".ts") ||
    fileName.endsWith(".tsx") ||
    fileName.endsWith(".jsx") ||
    fileName.endsWith(".py") ||
    fileName.endsWith(".html") ||
    fileName.endsWith(".css")
  ) {
    return "📄";
  }

  return "📎";
}

function audioExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) {
    return "m4a";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "webm";
}

async function createWaveform(
  audioBlob: Blob,
  barCount: number = 40,
): Promise<number[]> {
  const arrayBuffer: ArrayBuffer =
    await audioBlob.arrayBuffer();

  const audioContext = new AudioContext();

  try {
    const audioBuffer: AudioBuffer =
      await audioContext.decodeAudioData(
        arrayBuffer.slice(0),
      );

    const channelData: Float32Array =
      audioBuffer.getChannelData(0);

    const samplesPerBar: number = Math.max(
      1,
      Math.floor(channelData.length / barCount),
    );

    const values: number[] = [];

    for (let bar = 0; bar < barCount; bar += 1) {
      const start: number = bar * samplesPerBar;
      const end: number = Math.min(
        start + samplesPerBar,
        channelData.length,
      );

      let peak = 0;

      for (let index = start; index < end; index += 1) {
        peak = Math.max(
          peak,
          Math.abs(channelData[index]),
        );
      }

      values.push(Math.max(0.08, peak));
    }

    const maxPeak: number = Math.max(...values);

    return values.map(
      (value: number) =>
        maxPeak === 0 ? 0.08 : value / maxPeak,
    );
  } finally {
    await audioContext.close();
  }
}

export function PromptForm({
  prompt,
  isRunning,
  onPromptChange,
  onSubmit,
}: PromptFormProps): ReactElement {
  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(null);

  const mediaStreamRef =
    useRef<MediaStream | null>(null);

  const audioChunksRef =
    useRef<Blob[]>([]);

  const [attachment, setAttachment] =
    useState<File | null>(null);

  const [isRecording, setIsRecording] =
    useState<boolean>(false);

  const [audioPreviewUrl, setAudioPreviewUrl] =
    useState<string | null>(null);

  const [waveform, setWaveform] =
    useState<number[]>([]);

  const [recordingError, setRecordingError] =
    useState<string>("");

  const isPromptEmpty: boolean =
    prompt.trim() === "";

  const hasAttachment: boolean =
    attachment !== null;

  const isSubmitDisabled: boolean =
    isRunning ||
    isRecording ||
    (isPromptEmpty && !hasAttachment);

  const submitTooltip: string = isRunning
    ? hasAttachment
      ? "Uploading attachment..."
      : UI_TEXT.running
    : isRecording
      ? "Stop recording before sending"
      : isPromptEmpty && !hasAttachment
        ? UI_TEXT.emptyPromptTooltip
        : UI_TEXT.runButton;

  useEffect(() => {
    const textarea:
      | HTMLTextAreaElement
      | null = textareaRef.current;

    if (textarea === null) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height =
      `${textarea.scrollHeight}px`;
  }, [prompt]);

  useEffect(() => {
    return () => {
      mediaStreamRef.current
        ?.getTracks()
        .forEach((track: MediaStreamTrack) => {
          track.stop();
        });

      if (audioPreviewUrl !== null) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
    };
  }, [audioPreviewUrl]);

  function clearAudioPreview(): void {
    setAudioPreviewUrl(
      (currentUrl: string | null) => {
        if (currentUrl !== null) {
          URL.revokeObjectURL(currentUrl);
        }

        return null;
      },
    );

    setWaveform([]);
  }

  function handleAttachmentChange(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file: File | undefined =
      event.target.files?.[0];

    if (file === undefined) {
      return;
    }

    clearAudioPreview();
    setRecordingError("");
    setAttachment(file);
  }

  function removeAttachment(): void {
    clearAudioPreview();
    setAttachment(null);
    setRecordingError("");

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  async function startRecording(): Promise<void> {
    setRecordingError("");

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setRecordingError(
        "Voice recording is not supported in this browser.",
      );
      return;
    }

    try {
      const stream: MediaStream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      const recorder = new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.addEventListener(
        "dataavailable",
        (event: BlobEvent) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(
              event.data,
            );
          }
        },
      );

      recorder.addEventListener(
        "stop",
        async () => {
          const mimeType: string =
            recorder.mimeType || "audio/webm";

          const audioBlob = new Blob(
            audioChunksRef.current,
            {
              type: mimeType,
            },
          );

          const extension: string =
            audioExtension(mimeType);

          const audioFile = new File(
            [audioBlob],
            `voice-message-${Date.now()}.${extension}`,
            {
              type: mimeType,
            },
          );

          clearAudioPreview();

          const previewUrl: string =
            URL.createObjectURL(audioBlob);

          setAttachment(audioFile);
          setAudioPreviewUrl(previewUrl);

          try {
            const waveformValues: number[] =
              await createWaveform(audioBlob);

            setWaveform(waveformValues);
          } catch {
            setWaveform([]);
          }

          audioChunksRef.current = [];

          stream
            .getTracks()
            .forEach(
              (track: MediaStreamTrack) => {
                track.stop();
              },
            );

          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
        },
      );

      recorder.start();
      setIsRecording(true);
    } catch {
      setRecordingError(
        "Microphone access was denied or unavailable.",
      );
    }
  }

  function stopRecording(): void {
    const recorder: MediaRecorder | null =
      mediaRecorderRef.current;

    if (
      recorder === null ||
      recorder.state === "inactive"
    ) {
      return;
    }

    recorder.stop();
    setIsRecording(false);
  }

  function handleRecordButton(): void {
    if (isRecording) {
      stopRecording();
      return;
    }

    void startRecording();
  }

  async function submitMessage(): Promise<void> {
    if (isSubmitDisabled) {
      return;
    }

    await onSubmit(prompt, attachment);

    clearAudioPreview();
    setAttachment(null);
    setRecordingError("");

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();
    void submitMessage();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      event.key !== "Enter" ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    void submitMessage();
  }

  return (
    <form
      className="prompt-form"
      onSubmit={handleSubmit}
    >
      <div className="prompt-composer">
        {attachment !== null && (
          <div className="attachment-preview">
            <span
              className="attachment-icon"
              aria-hidden="true"
            >
              {getFileIcon(attachment)}
            </span>

            {audioPreviewUrl !== null ? (
              <div className="voice-preview">
                {waveform.length > 0 && (
                  <div
                    className="voice-waveform"
                    aria-hidden="true"
                  >
                    {waveform.map(
                      (
                        value: number,
                        index: number,
                      ) => (
                        <span
                          key={index}
                          style={{
                            height: `${Math.max(
                              4,
                              value * 28,
                            )}px`,
                          }}
                        />
                      ),
                    )}
                  </div>
                )}

                <audio
                  controls
                  src={audioPreviewUrl}
                />
              </div>
            ) : (
              <span className="attachment-name">
                {attachment.name}
              </span>
            )}

            {isRunning ? (
              <span className="attachment-status">
                Uploading...
              </span>
            ) : (
              <button
                className="attachment-remove-button"
                type="button"
                aria-label="Remove attachment"
                onClick={removeAttachment}
              >
                ×
              </button>
            )}
          </div>
        )}

        {recordingError !== "" && (
          <span className="attachment-status">
            {recordingError}
          </span>
        )}

        <div className="prompt-input-row">
          <input
            ref={fileInputRef}
            className="attachment-input"
            type="file"
            aria-label="Attach file"
            disabled={isRunning || isRecording}
            onChange={handleAttachmentChange}
          />

          <button
            className="attachment-button"
            type="button"
            disabled={isRunning || isRecording}
            aria-label="Attach file"
            data-tooltip="Attach file"
            onClick={() =>
              fileInputRef.current?.click()
            }
          >
            <span aria-hidden="true">📎</span>
          </button>

          <button
            className="attachment-button"
            type="button"
            disabled={isRunning}
            aria-label={
              isRecording
                ? "Stop voice recording"
                : "Record voice message"
            }
            data-tooltip={
              isRecording
                ? "Stop recording"
                : "Record voice message"
            }
            onClick={handleRecordButton}
          >
            <span aria-hidden="true">
              {isRecording ? "⏹️" : "🎤"}
            </span>
          </button>

          <textarea
            ref={textareaRef}
            id="prompt"
            name="prompt"
            rows={1}
            aria-label="Message"
            placeholder={
              isRecording
                ? "Recording..."
                : UI_TEXT.promptPlaceholder
            }
            value={prompt}
            disabled={isRunning || isRecording}
            onChange={(event) =>
              onPromptChange(
                event.target.value,
              )
            }
            onKeyDown={handleKeyDown}
          />

          <button
            className={`send-button${
              isRunning
                ? " send-button-running"
                : ""
            }`}
            type="submit"
            disabled={isSubmitDisabled}
            aria-label={submitTooltip}
            data-tooltip={submitTooltip}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              focusable="false"
            >
              <path d="M12 5 5.5 11.5l1.4 1.4 4.1-4.08V19h2V8.82l4.1 4.08 1.4-1.4L12 5Z" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  );
}