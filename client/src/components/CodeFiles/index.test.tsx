import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CodeFiles } from "./index";

test("CodeFiles renders a download control for every resource", () => {
  const markup: string = renderToStaticMarkup(
    <CodeFiles
      files={[
        {
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
