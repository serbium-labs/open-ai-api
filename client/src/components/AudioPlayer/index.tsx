import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from "react";

import { Icon } from "@components/Icon";

export type AudioPlayerProps = {
  src: string;
  label: string;
  waveform?: number[];
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

export function getAudioDuration(
  audio: Pick<HTMLAudioElement, "duration" | "seekable">,
): number | undefined {
  if (Number.isFinite(audio.duration) && audio.duration >= 0) {
    return audio.duration;
  }

  if (audio.seekable.length > 0) {
    const seekableEnd: number = audio.seekable.end(
      audio.seekable.length - 1,
    );

    if (Number.isFinite(seekableEnd) && seekableEnd >= 0) {
      return seekableEnd;
    }
  }

  return undefined;
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
  waveform,
}: AudioPlayerProps): ReactElement {
  const audioRef = useRef<HTMLAudioElement>(null);
  const durationProbeStartRef = useRef<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string>("");

  useEffect(() => {
    const audio: HTMLAudioElement | null = audioRef.current;

    const loadedDuration: number | undefined =
      audio === null ? undefined : getAudioDuration(audio);

    setDuration(loadedDuration ?? 0);
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackError("");

    return () => {
      audio?.pause();
    };
  }, [src]);

  function updateDuration(): void {
    const audio: HTMLAudioElement | null = audioRef.current;

    if (audio === null) {
      return;
    }

    const nextDuration: number | undefined = getAudioDuration(audio);

    if (nextDuration !== undefined) {
      setDuration(nextDuration);

      if (durationProbeStartRef.current !== null) {
        audio.currentTime = durationProbeStartRef.current;
        durationProbeStartRef.current = null;
      }
    } else if (
      audio.duration === Number.POSITIVE_INFINITY &&
      durationProbeStartRef.current === null
    ) {
      // MediaRecorder WebM blobs can omit duration metadata. Seeking forces
      // browsers to discover the actual end and emit another duration update.
      durationProbeStartRef.current = audio.currentTime;
      audio.currentTime = Number.MAX_SAFE_INTEGER;
    }
  }

  function updateCurrentTime(): void {
    updateDuration();

    if (durationProbeStartRef.current === null) {
      setCurrentTime(audioRef.current?.currentTime ?? 0);
    }
  }

  async function togglePlayback(): Promise<void> {
    const audio: HTMLAudioElement | null = audioRef.current;

    if (audio === null) {
      return;
    }

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

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onCanPlay={() => {
          setPlaybackError("");
          updateDuration();
        }}
        onDurationChange={updateDuration}
        onLoadedMetadata={updateDuration}
        onProgress={updateDuration}
        onTimeUpdate={updateCurrentTime}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => {
          setIsPlaying(false);
          setPlaybackError("Audio could not be loaded.");
        }}
      />

      <button
        className="audio-play-button icon-tooltip"
        type="button"
        aria-label={playbackLabel}
        data-tooltip={playbackLabel}
        data-tooltip-placement="top"
        onClick={() => {
          void togglePlayback();
        }}
      >
        <Icon name={isPlaying ? "pause" : "play"} />
      </button>

      <div className="audio-progress-group">
        <div
          className="audio-waveform"
          role="slider"
          tabIndex={duration > 0 ? 0 : -1}
          aria-label={seekLabel}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Math.min(currentTime, duration)}
          aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(duration)}`}
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
          {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
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
