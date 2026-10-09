import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AudioPlayer, formatAudioTime } from "./index";

test("formatAudioTime formats finite durations", () => {
  assert.equal(formatAudioTime(0), "0:00");
  assert.equal(formatAudioTime(65.9), "1:05");
  assert.equal(formatAudioTime(Number.NaN), "0:00");
});

test("AudioPlayer renders custom accessible controls without native controls", () => {
  const markup: string = renderToStaticMarkup(
    <AudioPlayer src="/voice.webm" label="voice-message.webm" />,
  );

  assert.match(markup, /aria-label="Play voice-message\.webm"/);
  assert.match(markup, /aria-label="Seek voice-message\.webm"/);
  assert.match(markup, /type="range"/);
  assert.doesNotMatch(markup, / controls=""/);
});
