import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AudioPlayer,
  formatAudioDuration,
  formatAudioTime,
  getAudioDuration,
  getDurationProbeRestoreTime,
  getPlaybackProgress,
  getSeekTime,
  getVoicePlaybackLabel,
} from "./index";

test("formatAudioTime formats finite durations", () => {
  assert.equal(formatAudioTime(0), "0:00");
  assert.equal(formatAudioTime(65.9), "1:05");
  assert.equal(formatAudioTime(Number.NaN), "0:00");
});

test("formatAudioDuration distinguishes unresolved duration from zero time", () => {
  assert.equal(formatAudioDuration(0), "--:--");
  assert.equal(formatAudioDuration(Number.NaN), "--:--");
  assert.equal(formatAudioDuration(Number.POSITIVE_INFINITY), "--:--");
  assert.equal(formatAudioDuration(Number.NEGATIVE_INFINITY), "--:--");
  assert.equal(formatAudioDuration(-1), "--:--");
  assert.equal(formatAudioDuration(12.4), "0:12");
});

test("getAudioDuration reads ordinary finite durations", () => {
  const emptyRanges: TimeRanges = {
    length: 0,
    start: () => 0,
    end: () => 0,
  };
  assert.equal(
    getAudioDuration({ duration: 65.9, seekable: emptyRanges }),
    65.9,
  );
});

test("getAudioDuration rejects non-finite and negative durations", () => {
  const emptyRanges: TimeRanges = {
    length: 0,
    start: () => 0,
    end: () => 0,
  };

  assert.equal(
    getAudioDuration({ duration: Number.NaN, seekable: emptyRanges }),
    undefined,
  );
  assert.equal(
    getAudioDuration({
      duration: Number.NEGATIVE_INFINITY,
      seekable: emptyRanges,
    }),
    undefined,
  );
  assert.equal(
    getAudioDuration({ duration: -1, seekable: emptyRanges }),
    undefined,
  );
});

test("getAudioDuration falls back from zero to a positive seekable end", () => {
  const loadedRanges: TimeRanges = {
    length: 1,
    start: () => 0,
    end: () => 42.75,
  };

  assert.equal(
    getAudioDuration({
      duration: 0,
      seekable: loadedRanges,
    }),
    42.75,
  );
});

test("getAudioDuration leaves Infinity unresolved for a zero seekable end", () => {
  const zeroRanges: TimeRanges = {
    length: 1,
    start: () => 0,
    end: () => 0,
  };

  assert.equal(
    getAudioDuration({
      duration: Number.POSITIVE_INFINITY,
      seekable: zeroRanges,
    }),
    undefined,
  );
});

test("getAudioDuration recovers when metadata changes from zero to valid", () => {
  const media = {
    duration: 0,
    seekable: {
      length: 0,
      start: () => 0,
      end: () => 0,
    } satisfies TimeRanges,
  };

  assert.equal(getAudioDuration(media), undefined);

  media.duration = 12.4;

  assert.equal(getAudioDuration(media), 12.4);
});

test("duration probes only restore playback for their original source", () => {
  const probe = {
    src: "blob:first-recording",
    startTime: 3.5,
  };

  assert.equal(
    getDurationProbeRestoreTime(probe, "blob:first-recording"),
    3.5,
  );
  assert.equal(
    getDurationProbeRestoreTime(probe, "blob:second-recording"),
    undefined,
  );
  assert.equal(
    getDurationProbeRestoreTime(null, "blob:first-recording"),
    undefined,
  );
});

test("AudioPlayer renders a loader while metadata is pending", () => {
  const markup: string = renderToStaticMarkup(
    <AudioPlayer src="/voice.webm" label="voice-message.webm" />,
  );

  assert.match(markup, /message-audio-skeleton/);
  assert.match(markup, /aria-label="Loading voice-message\.webm"/);
  assert.doesNotMatch(markup, /type="range"/);
  assert.doesNotMatch(markup, / controls=""/);
  assert.match(markup, /0:00 \/ --:--/);
  assert.doesNotMatch(markup, /0:00 \/ 0:00/);
  assert.match(markup, /aria-disabled="true"/);
});

test("getSeekTime maps and clamps waveform clicks to playback time", () => {
  assert.equal(getSeekTime(150, 100, 200, 80), 20);
  assert.equal(getSeekTime(50, 100, 200, 80), 0);
  assert.equal(getSeekTime(350, 100, 200, 80), 80);
  assert.equal(getSeekTime(150, 100, 0, 80), undefined);
  assert.equal(getSeekTime(150, 100, 200, 0), undefined);
});

test("getPlaybackProgress calculates bounded visual progress", () => {
  assert.equal(getPlaybackProgress(25, 100), 0.25);
  assert.equal(getPlaybackProgress(-10, 100), 0);
  assert.equal(getPlaybackProgress(120, 100), 1);
  assert.equal(getPlaybackProgress(10, Number.POSITIVE_INFINITY), 0);
});

test("getVoicePlaybackLabel reflects playback state", () => {
  assert.equal(getVoicePlaybackLabel(false), "Play voice");
  assert.equal(getVoicePlaybackLabel(true), "Pause voice");
});

test("AudioPlayer reuses supplied waveform values", () => {
  const markup: string = renderToStaticMarkup(
    <AudioPlayer
      src="/recording.webm"
      label="recording.webm"
      waveform={[0.5, 1]}
    />,
  );

  assert.match(markup, /height:14px/);
  assert.match(markup, /height:28px/);
});
