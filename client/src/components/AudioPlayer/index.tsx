import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from "react";

import { Icon } from "@components/Icon";

type ResourceLoadStatus = "loading" | "loaded" | "error";

export type AudioPlayerProps = {
  src: string;
  label: string;
  durationSeconds?: number;
  waveform?: number[];
};

export type AudioDurationProbe = {
  src: string;
  startTime: number;
};

const DEFAULT_WAVEFORM: number[] = [
  0.32, 0.48, 0.72, 0.45, 0.88, 0.61, 0.38, 0.76,
  0.54, 0.92, 0.68, 0.42, 0.58, 0.81, 0.47, 0.7,
  0.36, 0.63, 0.86, 0.52, 0.73, 0.44, 0.66, 0.34,
];

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const wholeSeconds: number = Math.floor(seconds);
  const minutes: number = Math.floor(wholeSeconds / 60);
  const remainder: number = wholeSeconds % 60;

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function formatAudioDuration(seconds: number): string {
  return Number.isFinite(seconds) && seconds > 0
    ? formatAudioTime(seconds)
    : "--:--";
}

export function getAudioDuration(
  audio: Pick<HTMLAudioElement, "duration" | "seekable">,
): number | undefined {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }

  if (audio.seekable.length > 0) {
    const seekableEnd: number = audio.seekable.end(
      audio.seekable.length - 1,
    );

    if (Number.isFinite(seekableEnd) && seekableEnd > 0) {
      return seekableEnd;
    }
  }

  return undefined;
}

export function getDurationProbeRestoreTime(
  probe: AudioDurationProbe | null,
  src: string,
): number | undefined {
  return probe?.src === src ? probe.startTime : undefined;
}

export function getSeekTime(
  pointerX: number,
  left: number,
  width: number,
  duration: number,
): number | undefined {
  if (width <= 0 || !Number.isFinite(duration) || duration <= 0) {
    return undefined;
  }

  const ratio: number = Math.min(
    1,
    Math.max(0, (pointerX - left) / width),
  );

  return ratio * duration;
}

export function getPlaybackProgress(
  currentTime: number,
  duration: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, currentTime / duration));
}

export function getVoicePlaybackLabel(isPlaying: boolean): string {
  return isPlaying ? "Pause voice" : "Play voice";
}

export function AudioPlayer({
  src,
  label,
  durationSeconds,
  waveform,
}: AudioPlayerProps): ReactElement {
  const audioRef = useRef<HTMLAudioElement>(null);
  const durationProbeRef = useRef<AudioDurationProbe | null>(null);
  const durationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialDuration =
    Number.isFinite(durationSeconds) && (durationSeconds ?? 0) > 0
      ? durationSeconds as number
      : 0;
  const [duration, setDuration] = useState<number>(initialDuration);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string>("");
  const [loadStatus, setLoadStatus] =
    useState<ResourceLoadStatus>(initialDuration > 0 ? "loaded" : "loading");

  useEffect(() => {
    const audio: HTMLAudioElement | null = audioRef.current;

    durationProbeRef.current = null;
    setDuration(initialDuration);
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackError("");
    setLoadStatus(initialDuration > 0 ? "loaded" : "loading");

    // Explicitly start metadata loading for a newly-created blob URL. Some
    // Chromium builds (notably through Docker Desktop on Windows) otherwise
    // defer the duration/seekable calculation until the first play().
    audio?.load();

    if (initialDuration <= 0 && audio !== null && !updateDuration()) {
      durationPollRef.current = setInterval(updateDuration, 100);
    }

    return () => {
      stopDurationPolling();
      audio?.pause();
    };
  }, [src, initialDuration]);

  function stopDurationPolling(): void {
    if (durationPollRef.current !== null) {
      clearInterval(durationPollRef.current);
      durationPollRef.current = null;
    }
  }

  function updateDuration(): boolean {
    const audio: HTMLAudioElement | null = audioRef.current;

    if (audio === null) {
      return false;
    }

    if (
      durationProbeRef.current !== null &&
      durationProbeRef.current.src !== src
    ) {
      durationProbeRef.current = null;
    }

    const nextDuration: number | undefined = getAudioDuration(audio);

    if (nextDuration !== undefined) {
      stopDurationPolling();
      setDuration(nextDuration);

      const restoreTime: number | undefined =
        getDurationProbeRestoreTime(durationProbeRef.current, src);

      durationProbeRef.current = null;

      if (restoreTime !== undefined) {
        try {
          audio.currentTime = restoreTime;
        } catch {
          // The source may have changed while the duration probe was running.
        }
      }

      return true;
    }

    if (durationProbeRef.current === null) {
      durationProbeRef.current = { src, startTime: audio.currentTime };
    }

    try {
      // MediaRecorder WebM blobs can omit duration metadata. Repeating the
      // end seek also covers Chromium reporting NaN/0 before it reports
      // Infinity or makes the seekable range available.
      audio.currentTime = Number.MAX_SAFE_INTEGER;
    } catch {
      // Seeking can fail before metadata exists; polling retries it shortly.
    }

    return false;
  }

  function updateCurrentTime(): void {
    updateDuration();

    if (durationProbeRef.current === null) {
      setCurrentTime(audioRef.current?.currentTime ?? 0);
    }
  }

  function cancelDurationProbe(): void {
    const audio: HTMLAudioElement | null = audioRef.current;
    const restoreTime: number | undefined =
      getDurationProbeRestoreTime(durationProbeRef.current, src);

    stopDurationPolling();
    durationProbeRef.current = null;

    if (audio !== null && restoreTime !== undefined) {
      try {
        audio.currentTime = restoreTime;
      } catch {
        // The source may have changed while the duration probe was running.
      }
    }
  }

  async function togglePlayback(): Promise<void> {
    const audio: HTMLAudioElement | null = audioRef.current;

    if (audio === null) {
      return;
    }

    cancelDurationProbe();

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      setPlaybackError("");
      await audio.play();
    } catch {
      setIsPlaying(false);
      setPlaybackError("Audio playback failed. Please try again.");
    }
  }

  function seekTo(nextTime: number): void {
    const audio: HTMLAudioElement | null = audioRef.current;

    if (audio === null || duration <= 0) {
      return;
    }

    cancelDurationProbe();

    const boundedTime: number = Math.min(duration, Math.max(0, nextTime));
    audio.currentTime = boundedTime;
    setCurrentTime(boundedTime);
  }

  function seekFromWaveform(event: MouseEvent<HTMLDivElement>): void {
    const bounds: DOMRect = event.currentTarget.getBoundingClientRect();
    const nextTime: number | undefined = getSeekTime(
      event.clientX,
      bounds.left,
      bounds.width,
      duration,
    );

    if (nextTime !== undefined) {
      seekTo(nextTime);
    }
  }

  function seekWithKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
    let nextTime: number | undefined;

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextTime = currentTime + 5;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextTime = currentTime - 5;
    } else if (event.key === "Home") {
      nextTime = 0;
    } else if (event.key === "End") {
      nextTime = duration;
    }

    if (nextTime !== undefined) {
      event.preventDefault();
      seekTo(nextTime);
    }
  }

  const playbackLabel: string = getVoicePlaybackLabel(isPlaying);
  const waveformValues: number[] =
    waveform !== undefined && waveform.length > 0
      ? waveform
      : DEFAULT_WAVEFORM;
  const progress: number = getPlaybackProgress(currentTime, duration);
  const seekLabel: string = `Seek ${label}`;
  const isLoading: boolean = loadStatus === "loading";

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onCanPlay={() => {
          setPlaybackError("");
          setLoadStatus("loaded");
          updateDuration();
        }}
        onDurationChange={updateDuration}
        onLoadedMetadata={() => {
          setPlaybackError("");
          setLoadStatus("loaded");
          updateDuration();
        }}
        onLoadedData={updateDuration}
        onProgress={updateDuration}
        onTimeUpdate={updateCurrentTime}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => {
          stopDurationPolling();
          durationProbeRef.current = null;
          setIsPlaying(false);
          setPlaybackError("Audio could not be loaded.");
          setLoadStatus("error");
        }}
      />

      {isLoading ? (
        <span
          className="message-resource-skeleton message-audio-skeleton"
          role="status"
          aria-label={`Loading ${label}`}
        />
      ) : null}
      <button
        className="audio-play-button icon-tooltip"
        type="button"
        hidden={loadStatus !== "loaded"}
        disabled={loadStatus !== "loaded"}
        aria-label={playbackLabel}
        data-tooltip={playbackLabel}
        data-tooltip-placement="top"
        onClick={() => {
          void togglePlayback();
        }}
      >
        <Icon name={isPlaying ? "pause" : "play"} />
      </button>

      <div
        className="audio-progress-group"
        hidden={loadStatus !== "loaded"}
      >
        <div
          className="audio-waveform"
          role="slider"
          tabIndex={duration > 0 ? 0 : -1}
          aria-label={seekLabel}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Math.min(currentTime, duration)}
          aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioDuration(duration)}`}
          aria-disabled={duration <= 0}
          aria-busy={duration <= 0 && playbackError === ""}
          onClick={seekFromWaveform}
          onKeyDown={seekWithKeyboard}
        >
          <div className="audio-waveform-bars" aria-hidden="true">
            {waveformValues.map((value: number, index: number) => (
              <span
                key={index}
                style={{ height: `${Math.max(4, value * 28)}px` }}
              />
            ))}
          </div>
          <div
            className="audio-waveform-progress"
            style={{
              clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
            }}
            aria-hidden="true"
          >
            <div className="audio-waveform-bars">
              {waveformValues.map((value: number, index: number) => (
                <span
                  key={index}
                  style={{ height: `${Math.max(4, value * 28)}px` }}
                />
              ))}
            </div>
          </div>
        </div>

        <span className="audio-time" aria-live="off">
          {formatAudioTime(currentTime)} / {formatAudioDuration(duration)}
        </span>
      </div>

      {playbackError !== "" ? (
        <span className="audio-error" role="alert">
          {playbackError}
        </span>
      ) : null}
    </div>
  );
}
