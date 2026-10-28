import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  appendPromptTurn,
  ChatTranscript,
  getResourceLoadStatus,
  isSmallImage,
  isSystemVoiceFilename,
  SMALL_IMAGE_MAX_DIMENSION_PX,
  type ChatMessageAttachment,
} from "./index";

test("small image detection only falls back when both dimensions are tiny", () => {
  assert.equal(SMALL_IMAGE_MAX_DIMENSION_PX, 96);
  assert.equal(isSmallImage({ width: 96, height: 96 }), true);
  assert.equal(isSmallImage({ width: 97, height: 96 }), false);
  assert.equal(isSmallImage({ width: 32, height: 600 }), false);
  assert.equal(isSmallImage({ width: 1200, height: 40 }), false);
});

test("image attachments render an intrinsic-size-aware preview", () => {
  const markup: string = renderToStaticMarkup(
    createElement(ChatTranscript, {
      chatId: "image-chat",
      messages: [
        {
          id: "message-image",
          role: "user",
          content: "",
          status: "complete",
          attachments: [
            {
              name: "landscape.png",
              mimeType: "image/png",
              path: "landscape.png",
            },
          ],
        },
      ],
    }),
  );

  assert.match(markup, /class="message-attachment-image"/);
  assert.match(markup, /class="message-resource-skeleton message-image-skeleton"/);
  assert.match(markup, /aria-label="Loading landscape\.png"/);
  assert.match(markup, /loading="lazy"/);
  assert.match(markup, />landscape\.png<\/span>/);
});

test("resource loading settles to content or an error fallback", () => {
  assert.equal(getResourceLoadStatus("load"), "loaded");
  assert.equal(getResourceLoadStatus("error"), "error");
});

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

test("pending voice turns show audio processing without an empty assistant container", () => {
  const turn = appendPromptTurn([], "", [{
    name: "voice-message.webm",
    mimeType: "audio/webm",
    path: "",
    previewUrl: "blob:voice-preview",
  }]);
  const markup: string = renderToStaticMarkup(
    createElement(ChatTranscript, {
      chatId: undefined,
      messages: turn.messages,
    }),
  );

  assert.match(markup, /Processing audio\.\.\./);
  assert.doesNotMatch(markup, />Thinking</);
  assert.equal(markup.match(/class="message-content"/g)?.length, 1);
  assert.match(
    markup,
    /class="chat-message chat-message-assistant chat-message-pending"[^>]*><\/article>/,
  );
});

test("text-only pending turns keep the thinking indicator", () => {
  const turn = appendPromptTurn([], "Hello");
  const markup: string = renderToStaticMarkup(
    createElement(ChatTranscript, {
      chatId: undefined,
      messages: turn.messages,
    }),
  );

  assert.match(markup, />Thinking</);
  assert.doesNotMatch(markup, /Processing audio\.\.\./);
});

test("completed and failed voice turns remove audio processing status", () => {
  const attachment: ChatMessageAttachment = {
    name: "voice-message.webm",
    mimeType: "audio/webm",
    path: "voice-message.webm",
  };

  for (const assistant of [
    {
      id: "message-2",
      role: "assistant" as const,
      content: "Done",
      status: "complete" as const,
      attachments: [],
    },
    {
      id: "message-2",
      role: "assistant" as const,
      content: "Transcription failed",
      status: "error" as const,
      attachments: [],
    },
  ]) {
    const markup: string = renderToStaticMarkup(
      createElement(ChatTranscript, {
        chatId: "chat-1",
        messages: [{
          id: "message-1",
          role: "user",
          content: "",
          status: "complete",
          attachments: [attachment],
        }, assistant],
      }),
    );

    assert.doesNotMatch(markup, /Processing audio\.\.\./);
    assert.match(markup, new RegExp(assistant.content));
  }
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
  assert.match(markup, /class="message-resource-skeleton message-audio-skeleton"/);
  assert.match(markup, /aria-label="Loading meeting-recording\.mp3"/);
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
  assert.match(markup, /class="message-resource-skeleton message-audio-skeleton"/);
  assert.doesNotMatch(
    markup,
    />voice-message-179231823782\.webm<\/span>/,
  );
  assert.doesNotMatch(markup, / controls=""/);
});
