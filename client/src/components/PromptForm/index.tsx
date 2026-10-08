import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import { AudioPlayer, formatAudioTime } from "@components/AudioPlayer";
import { Icon } from "@components/Icon";
import { UI_TEXT } from "@constants";
import {
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
  type LucideIcon,
} from "lucide-react";

export type PromptFormProps = {
  prompt: string;
  isRunning: boolean;
  submitError: string | null;
  onPromptChange: (prompt: string) => void;
  onSubmit: (
    prompt: string,
    attachment: File | null,
  ) => Promise<boolean>;
};

type SubmissionLock = {
  current: boolean;
};

type RunSubmissionOptions = {
  lock: SubmissionLock;
  prompt: string;
  attachment: File | null;
  onSubmit: PromptFormProps["onSubmit"];
  onStart: () => void;
  onSuccess: () => void;
  onFailure: (error: unknown) => void;
  onFinish: () => void;
};

export async function runComposerSubmission({
  lock,
  prompt,
  attachment,
  onSubmit,
  onStart,
  onSuccess,
  onFailure,
  onFinish,
}: RunSubmissionOptions): Promise<void> {
  if (lock.current) {
    return;
  }

  lock.current = true;
  onStart();

  try {
    const wasSent: boolean = await onSubmit(prompt, attachment);

    if (wasSent) {
      onSuccess();
    } else {
      onFailure(new Error("Message submission failed"));
    }
  } catch (error: unknown) {
    onFailure(error);
  } finally {
    lock.current = false;
    onFinish();
  }
}

function getFileIcon(file: File): LucideIcon {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  if (fileType.startsWith("image/")) {
    return FileImage;
  }

  if (
    fileType === "application/pdf" ||
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx") ||
    fileType.startsWith("text/")
  ) {
    return FileText;
  }

  if (
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".csv")
  ) {
    return FileSpreadsheet;
  }

  if (
    fileName.endsWith(".zip") ||
    fileName.endsWith(".rar") ||
    fileName.endsWith(".7z")
  ) {
    return FileArchive;
  }

  return FileIcon;
}

export type RecordedAudioFormat = {
  extension: "m4a" | "ogg" | "webm";
  mimeType: "audio/mp4" | "audio/ogg" | "audio/webm";
};

const RECORDER_MIME_TYPES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

export function selectRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | undefined {
  return RECORDER_MIME_TYPES.find(isTypeSupported);
}

export async function detectRecordedAudioFormat(
  audioBlob: Blob,
): Promise<RecordedAudioFormat | undefined> {
  const bytes = new Uint8Array(
    await audioBlob.slice(0, 4096).arrayBuffer(),
  );

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return { extension: "ogg", mimeType: "audio/ogg" };
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    const headerText = new TextDecoder("latin1").decode(bytes);

    if (headerText.toLowerCase().includes("webm")) {
      return { extension: "webm", mimeType: "audio/webm" };
    }
  }

  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return { extension: "m4a", mimeType: "audio/mp4" };
  }

  return undefined;
}

export async function createRecordedAudioFile(
  chunks: Blob[],
  timestamp: number = Date.now(),
): Promise<{ blob: Blob; file: File }> {
  // Do not carry a potentially incorrect MediaRecorder label onto the bytes.
  const untypedBlob = new Blob(chunks);
  const format = await detectRecordedAudioFormat(untypedBlob);

  if (format === undefined) {
    throw new Error(
      "The browser produced an unsupported audio format. Try a current version of Chrome, Firefox, or Safari.",
    );
  }

  const blob = new Blob([untypedBlob], {
    type: format.mimeType,
  });
  const file = new File(
    [blob],
    `voice-message-${timestamp}.${format.extension}`,
    { type: format.mimeType },
  );

  return { blob, file };
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
  submitError,
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

  const audioPreviewUrlRef =
    useRef<string | null>(null);

  const isMountedRef = useRef<boolean>(true);

  const isSubmittingRef = useRef<boolean>(false);

  const [attachment, setAttachment] =
    useState<File | null>(null);

  const [isRecording, setIsRecording] =
    useState<boolean>(false);

  const [isRequestingMicrophone, setIsRequestingMicrophone] =
    useState<boolean>(false);

  const [isFinalizingRecording, setIsFinalizingRecording] =
    useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] =
    useState<boolean>(false);

  const [recordingElapsed, setRecordingElapsed] =
    useState<number>(0);

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
    isSubmitting ||
    isRecording ||
    isRequestingMicrophone ||
    isFinalizingRecording ||
    (isPromptEmpty && !hasAttachment);

  const submitTooltip: string = isRunning || isSubmitting
    ? hasAttachment
      ? "Sending attachment..."
      : UI_TEXT.running
    : isFinalizingRecording
      ? "Preparing voice recording..."
      : isRecording || isRequestingMicrophone
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
    if (!isRecording) {
      return;
    }

    const startedAt: number = Date.now();
    setRecordingElapsed(0);

    const timer: number = window.setInterval(() => {
      setRecordingElapsed(
        Math.floor((Date.now() - startedAt) / 1000),
      );
    }, 250);

    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      const recorder: MediaRecorder | null = mediaRecorderRef.current;

      if (recorder !== null) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;

        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }

      mediaStreamRef.current
        ?.getTracks()
        .forEach((track: MediaStreamTrack) => track.stop());

      if (audioPreviewUrlRef.current !== null) {
        URL.revokeObjectURL(audioPreviewUrlRef.current);
      }
    };
  }, []);

  function clearAudioPreview(): void {
    if (audioPreviewUrlRef.current !== null) {
      URL.revokeObjectURL(audioPreviewUrlRef.current);
      audioPreviewUrlRef.current = null;
    }

    setAudioPreviewUrl(null);
    setWaveform([]);
  }

  function stopMediaStream(stream: MediaStream | null): void {
    stream
      ?.getTracks()
      .forEach((track: MediaStreamTrack) => track.stop());

    if (mediaStreamRef.current === stream) {
      mediaStreamRef.current = null;
    }
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

    let stream: MediaStream | null = null;
    setIsRequestingMicrophone(true);

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      if (!isMountedRef.current) {
        stopMediaStream(stream);
        return;
      }

      const selectedMimeType: string | undefined =
        selectRecorderMimeType((mimeType: string) =>
          MediaRecorder.isTypeSupported(mimeType),
        );
      const recorder = new MediaRecorder(
        stream,
        selectedMimeType === undefined
          ? undefined
          : { mimeType: selectedMimeType },
      );

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        recorder.onstop = null;
        stopMediaStream(stream);
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];

        if (isMountedRef.current) {
          setIsRecording(false);
          setIsFinalizingRecording(false);
          setRecordingError("Voice recording failed. Please try again.");
        }
      };

      recorder.onstop = () => {
        const chunks: Blob[] = audioChunksRef.current;
        audioChunksRef.current = [];
        stopMediaStream(stream);
        mediaRecorderRef.current = null;

        if (!isMountedRef.current) {
          return;
        }

        if (chunks.reduce(
          (size: number, chunk: Blob) => size + chunk.size,
          0,
        ) === 0) {
          setRecordingError("No audio was captured. Please try again.");
          setIsFinalizingRecording(false);
          return;
        }

        void createRecordedAudioFile(chunks)
          .then(({ blob, file }) => {
            if (!isMountedRef.current) {
              return;
            }

            clearAudioPreview();

            const previewUrl: string = URL.createObjectURL(blob);
            audioPreviewUrlRef.current = previewUrl;
            setAttachment(file);
            setAudioPreviewUrl(previewUrl);

            void createWaveform(blob)
              .then((waveformValues: number[]) => {
                if (isMountedRef.current) {
                  setWaveform(waveformValues);
                }
              })
              .catch(() => {
                if (isMountedRef.current) {
                  setWaveform([]);
                }
              });
          })
          .catch((error: unknown) => {
            if (isMountedRef.current) {
              setRecordingError(
                error instanceof Error
                  ? error.message
                  : "The recorded audio format is unsupported.",
              );
            }
          })
          .finally(() => {
            if (isMountedRef.current) {
              setIsFinalizingRecording(false);
            }
          });
      };

      recorder.start();
      setIsRecording(true);
    } catch (error: unknown) {
      stopMediaStream(stream);
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];

      const errorName: string =
        error instanceof DOMException ? error.name : "";

      setRecordingError(
        errorName === "NotAllowedError" || errorName === "SecurityError"
          ? "Microphone permission was denied. Allow access and try again."
          : "The microphone is unavailable. Check your device and try again.",
      );
    } finally {
      if (isMountedRef.current) {
        setIsRequestingMicrophone(false);
      }
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
    setIsFinalizingRecording(true);
  }

  function handleRecordButton(): void {
    if (isRecording) {
      stopRecording();
      return;
    }

    void startRecording();
  }

  async function submitMessage(): Promise<void> {
    if (isSubmitDisabled || isSubmittingRef.current) {
      return;
    }

    const submittedAttachment: File | null = attachment;
    const submittedAudioPreviewUrl: string | null =
      audioPreviewUrlRef.current;
    const submittedWaveform: number[] = waveform;
    const isVoiceSubmission: boolean =
      submittedAudioPreviewUrl !== null;

    await runComposerSubmission({
      lock: isSubmittingRef,
      prompt,
      attachment: submittedAttachment,
      onSubmit,
      onStart: () => {
        setIsSubmitting(true);
        setRecordingError("");

        if (isVoiceSubmission) {
          setAttachment(null);
          audioPreviewUrlRef.current = null;
          setAudioPreviewUrl(null);
          setWaveform([]);
        }

        if (isVoiceSubmission && fileInputRef.current !== null) {
          fileInputRef.current.value = "";
        }
      },
      onSuccess: () => {
        if (submittedAudioPreviewUrl !== null) {
          URL.revokeObjectURL(submittedAudioPreviewUrl);
        }

        setAttachment(null);
        setRecordingError("");

        if (fileInputRef.current !== null) {
          fileInputRef.current.value = "";
        }
      },
      onFailure: () => {
        if (!isVoiceSubmission) {
          return;
        }

        if (!isMountedRef.current) {
          if (submittedAudioPreviewUrl !== null) {
            URL.revokeObjectURL(submittedAudioPreviewUrl);
          }

          return;
        }

        setAttachment(submittedAttachment);
        audioPreviewUrlRef.current = submittedAudioPreviewUrl;
        setAudioPreviewUrl(submittedAudioPreviewUrl);
        setWaveform(submittedWaveform);
        setRecordingError(
          "Voice message failed to send. Your recording was restored. Please try again.",
        );
      },
      onFinish: () => {
        if (isMountedRef.current) {
          setIsSubmitting(false);
        }
      },
    });
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
            <span className="attachment-icon" aria-hidden="true">
              {(() => {
                const Icon = getFileIcon(attachment);
                return <Icon size={20} strokeWidth={1.75} />;
              })()}
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

                <AudioPlayer
                  src={audioPreviewUrl}
                  label={attachment.name}
                />
              </div>
            ) : (
              <span className="attachment-name">
                {attachment.name}
              </span>
            )}

            {isRunning ? (
              <span className="attachment-status">
                Sending attachment...
              </span>
            ) : (
              <button
                className="attachment-remove-button icon-tooltip"
                type="button"
                aria-label="Remove attachment"
                data-tooltip="Remove attachment"
                onClick={removeAttachment}
              >
                <Icon name="remove" />
              </button>
            )}
          </div>
        )}

        {recordingError !== "" && (
          <span className="recording-error" role="alert">
            {recordingError}
          </span>
        )}

        {submitError !== null && (
          <p className="attachment-status" role="alert">
            Send failed: {submitError}. Please retry.
          </p>
        )}

        <div className="prompt-input-row">
          <input
            ref={fileInputRef}
            className="attachment-input"
            type="file"
            aria-label="Attach file"
            disabled={
              isRunning ||
              isRecording ||
              isRequestingMicrophone ||
              isFinalizingRecording
            }
            onChange={handleAttachmentChange}
          />

          <button
            className="attachment-button icon-tooltip"
            type="button"
            disabled={
              isRunning ||
              isRecording ||
              isRequestingMicrophone ||
              isFinalizingRecording
            }
            aria-label="Attach file"
            data-tooltip="Attach file"
            onClick={() =>
              fileInputRef.current?.click()
            }
          >
            <Paperclip size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <button
            className={`attachment-button icon-tooltip${
              isRecording ? " recording-stop-button" : ""
            }`}
            type="button"
            disabled={
              isRunning ||
              isRequestingMicrophone ||
              isFinalizingRecording
            }
            aria-label={
              isRecording
                ? "Stop voice recording"
                : isRequestingMicrophone
                  ? "Requesting microphone access"
                : "Record voice message"
            }
            data-tooltip={
              isRecording
                ? "Stop recording"
                : isRequestingMicrophone
                  ? "Requesting microphone access"
                : "Record voice message"
            }
            onClick={handleRecordButton}
          >
            <Icon name={isRecording ? "stop" : "microphone"} />
          </button>

          {isRecording ? (
            <div
              className="recording-state"
              role="status"
              aria-live="polite"
            >
              <span className="recording-indicator" aria-hidden="true" />
              <span className="recording-label">Recording</span>
              <time
                dateTime={`PT${recordingElapsed}S`}
                aria-label={`${recordingElapsed} seconds elapsed`}
                role="timer"
                aria-live="off"
              >
                {formatAudioTime(recordingElapsed)}
              </time>
              <span className="recording-input-note">
                Text input unavailable
              </span>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              id="prompt"
              name="prompt"
              rows={1}
              aria-label="Message"
              placeholder={UI_TEXT.promptPlaceholder}
              value={prompt}
              disabled={
                isRunning ||
                isRequestingMicrophone ||
                isFinalizingRecording
              }
              onChange={(event) =>
                onPromptChange(
                  event.target.value,
                )
              }
              onKeyDown={handleKeyDown}
            />
          )}

          <button
            className={`send-button icon-tooltip${
              isRunning
                ? " send-button-running"
                : ""
            }`}
            type="submit"
            disabled={isSubmitDisabled}
            aria-label={submitTooltip}
            data-tooltip={submitTooltip}
          >
            <Icon name="send" />
          </button>
        </div>
      </div>
    </form>
  );
}
