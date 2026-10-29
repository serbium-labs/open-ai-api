import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CodeFiles, combineResources } from "./index";

test("CodeFiles renders a download control for every resource", () => {
  const markup: string = renderToStaticMarkup(
    <CodeFiles
      files={[
        {
          kind: "code",
          id: "resource-1",
          messageId: "message-1",
          path: "src/example.ts",
          content: "export const answer = 42;",
          createdAt: "2026-10-28T00:00:00.000Z",
        },
      ]}
      status="Ready"
      onResourceNavigate={() => undefined}
    />,
  );

  assert.match(markup, /aria-label="Download src\/example\.ts"/);
  assert.match(markup, /data-tooltip="Download"/);
  assert.match(markup, /class="lucide lucide-download"/);
});

test("CodeFiles renders message attachments with previews and download controls", () => {
  const markup: string = renderToStaticMarkup(
    <CodeFiles
      files={[{
        id: "attachment-message-1-0", kind: "attachment", messageId: "message-1",
        name: "diagram.png", mimeType: "image/png", path: "stored-diagram.png",
        url: "/api/chats/chat-1/attachments/stored-diagram.png",
      }]}
      status="1 resource"
      onResourceNavigate={() => undefined}
    />,
  );

  assert.match(markup, /aria-label="Download diagram\.png"/);
  assert.match(markup, /<img[^>]+diagram\.png/);
  assert.match(markup, /Go to diagram\.png in chat/);
});

test("combineResources adds attachments from every message to generated resources", () => {
  const resources = combineResources(
    [{
      id: "resource-1",
      messageId: "message-1",
      path: "src/example.ts",
      content: "export {};",
      createdAt: "2026-10-28T00:00:00.000Z",
    }],
    [{
      id: "message-2",
      attachments: [{ name: "voice.ogg", mimeType: "audio/ogg", path: "stored-voice.ogg" }],
    }],
    "chat-1",
  );

  assert.deepEqual(
    resources.map(({ id, kind, messageId }) => ({ id, kind, messageId })),
    [
      { id: "resource-1", kind: "code", messageId: "message-1" },
      { id: "attachment-message-2-0", kind: "attachment", messageId: "message-2" },
    ],
  );
  assert.equal(resources[1]?.kind === "attachment" ? resources[1].url : undefined,
    "/api/chats/chat-1/attachments/stored-voice.ogg");
});
