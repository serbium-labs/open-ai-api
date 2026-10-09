import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react";

import { Icon } from "@components/Icon";

export type AudioPlayerProps = {
  src: string;
  label: string;
};

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const wholeSeconds: number = Math.floor(seconds);
  const minutes: number = Math.floor(wholeSeconds / 60);
  const remainder: number = wholeSeconds % 60;

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  src,
  label,
}: AudioPlayerProps): ReactElement {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string>("");

  useEffect(() => {
    const audio: HTMLAudioElement | null = audioRef.current;

    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackError("");

    return () => {
      audio?.pause();
    };
  }, [src]);

  function updateDuration(): void {
    const nextDuration: number = audioRef.current?.duration ?? 0;
    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
  }

  function updateCurrentTime(): void {
    setCurrentTime(audioRef.current?.currentTime ?? 0);
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

  function seek(event: ChangeEvent<HTMLInputElement>): void {
    const audio: HTMLAudioElement | null = audioRef.current;

    if (audio === null) {
      return;
    }

    const nextTime: number = Number(event.target.value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  const playbackLabel: string = isPlaying
    ? `Pause ${label}`
    : `Play ${label}`;

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onCanPlay={() => setPlaybackError("")}
        onDurationChange={updateDuration}
        onLoadedMetadata={updateDuration}
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
        onClick={() => {
          void togglePlayback();
        }}
      >
        <Icon name={isPlaying ? "pause" : "play"} />
      </button>

      <div className="audio-progress-group">
        <input
          className="audio-progress"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          disabled={duration <= 0}
          aria-label={`Seek ${label}`}
          onChange={seek}
        />

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
