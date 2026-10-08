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

export type PromptFormProps = {
  prompt: string;
  isRunning: boolean;
  onPromptChange: (prompt: string) => void;
  onSubmit: (
    prompt: string,
    attachment: File | null,
  ) => Promise<void>;
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
    await onSubmit(prompt, attachment);
    onSuccess();
  } catch (error: unknown) {
    onFailure(error);
  } finally {
    lock.current = false;
    onFinish();
  }
}

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
    (isPromptEmpty && !hasAttachment);

  const submitTooltip: string = isRunning || isSubmitting
    ? hasAttachment
      ? "Uploading attachment..."
      : UI_TEXT.running
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

      const recorder = new MediaRecorder(stream);

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
          setRecordingError("Voice recording failed. Please try again.");
        }
      };

      recorder.onstop = () => {
        const mimeType: string =
          recorder.mimeType || "audio/webm";

        const audioBlob = new Blob(
          audioChunksRef.current,
          { type: mimeType },
        );

        audioChunksRef.current = [];
        stopMediaStream(stream);
        mediaRecorderRef.current = null;

        if (!isMountedRef.current) {
          return;
        }

        if (audioBlob.size === 0) {
          setRecordingError("No audio was captured. Please try again.");
          return;
        }

        const extension: string = audioExtension(mimeType);
        const audioFile = new File(
          [audioBlob],
          `voice-message-${Date.now()}.${extension}`,
          { type: mimeType },
        );

        clearAudioPreview();

        const previewUrl: string = URL.createObjectURL(audioBlob);
        audioPreviewUrlRef.current = previewUrl;
        setAttachment(audioFile);
        setAudioPreviewUrl(previewUrl);

        void createWaveform(audioBlob)
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
                Uploading...
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

        <div className="prompt-input-row">
          <input
            ref={fileInputRef}
            className="attachment-input"
            type="file"
            aria-label="Attach file"
            disabled={isRunning || isRecording || isRequestingMicrophone}
            onChange={handleAttachmentChange}
          />

          <button
            className="attachment-button icon-tooltip"
            type="button"
            disabled={isRunning || isRecording || isRequestingMicrophone}
            aria-label="Attach file"
            data-tooltip="Attach file"
            onClick={() =>
              fileInputRef.current?.click()
            }
          >
            <Icon name="attachment" />
          </button>

          <button
            className={`attachment-button icon-tooltip${
              isRecording ? " recording-stop-button" : ""
            }`}
            type="button"
            disabled={isRunning || isRequestingMicrophone}
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
              disabled={isRunning || isRequestingMicrophone}
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
