import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  appendPromptTurn,
  ChatTranscript,
  isSystemVoiceFilename,
  type ChatMessageAttachment,
} from "./index";

test("appendPromptTurn puts the user attachment before the pending assistant", () => {
  const attachment: ChatMessageAttachment = {
    name: "voice-message.webm",
    mimeType: "audio/webm",
    path: "",
    previewUrl: "blob:voice-preview",
  };

  const result = appendPromptTurn([], "", [attachment]);

  assert.equal(result.messages.length, 2);
  assert.deepEqual(result.messages[0]?.attachments, [attachment]);
  assert.equal(result.messages[0]?.role, "user");
  assert.equal(result.messages[1]?.role, "assistant");
  assert.equal(result.messages[1]?.status, "pending");
});

test("isSystemVoiceFilename only identifies generated voice recording names", () => {
  assert.equal(isSystemVoiceFilename("voice-message-179231823782.webm"), true);
  assert.equal(isSystemVoiceFilename("voice-message-179231823782.ogg"), true);
  assert.equal(isSystemVoiceFilename("VOICE-MESSAGE-179231823782.M4A"), true);
  assert.equal(isSystemVoiceFilename("voice-message.webm"), false);
  assert.equal(isSystemVoiceFilename("meeting-recording.webm"), false);
  assert.equal(isSystemVoiceFilename("voice-message-179231823782.pdf"), false);
});

test("sent uploaded audio uses the shared waveform player", () => {
  const markup: string = renderToStaticMarkup(
    createElement(ChatTranscript, {
      chatId: undefined,
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "",
          status: "complete",
          attachments: [
            {
              name: "meeting-recording.mp3",
              mimeType: "audio/mpeg",
              path: "",
              previewUrl: "blob:uploaded-audio",
            },
          ],
        },
      ],
    }),
  );

  assert.match(markup, /src="blob:uploaded-audio"/);
  assert.match(markup, /class="audio-waveform"/);
  assert.match(markup, /role="slider"/);
  assert.match(markup, />meeting-recording\.mp3<\/span>/);
  assert.doesNotMatch(markup, / controls=""/);
  assert.doesNotMatch(markup, /type="range"/);
});

test("persisted voice audio restores the waveform player without its generated filename", () => {
  const markup: string = renderToStaticMarkup(
    createElement(ChatTranscript, {
      chatId: "chat/with spaces",
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "",
          status: "complete",
          attachments: [
            {
              name: "voice-message-179231823782.webm",
              mimeType: "audio/webm",
              path: "uploads/voice message.webm",
            },
          ],
        },
      ],
    }),
  );

  assert.match(
    markup,
    /src="\/api\/chats\/chat%2Fwith%20spaces\/attachments\/uploads%2Fvoice%20message\.webm"/,
  );
  assert.match(markup, /class="audio-waveform"/);
  assert.match(markup, /aria-label="Seek voice-message-179231823782\.webm"/);
  assert.doesNotMatch(
    markup,
    />voice-message-179231823782\.webm<\/span>/,
  );
  assert.doesNotMatch(markup, / controls=""/);
});
