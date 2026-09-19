import type { ReactElement, ReactNode } from "react";

export type ChatMessageRole = "user" | "assistant";
export type ChatMessageStatus = "complete" | "pending" | "error";

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
};

export type MessageSegment =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "code";
      code: string;
      language: string | undefined;
      path: string | undefined;
    };

export type AppendPromptTurnResult = {
  messages: ChatMessage[];
  assistantMessageId: string;
};

export type ChatTranscriptProps = {
  messages: ChatMessage[];
};

const FENCE_PATTERN: RegExp = /```([^\r\n`]*)\r?\n([\s\S]*?)\r?\n```/g;

function normalizeCode(code: string): string {
  return code.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

function isPathHint(value: string): boolean {
  return value.includes("/") || value.includes("\\") || /\.[A-Za-z0-9]+$/.test(value);
}

function parseInfoString(info: string): Pick<Extract<MessageSegment, { kind: "code" }>, "language" | "path"> {
  const parts: string[] = info.trim().split(/\s+/).filter(Boolean);
  let language: string | undefined;
  let path: string | undefined;

  for (const part of parts) {
    if (path === undefined && isPathHint(part)) {
      path = part.replace(/\\/g, "/");
      continue;
    }

    if (language === undefined) {
      language = part.toLowerCase();
    }
  }

  return { language, path };
}

export function parseMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor: number = 0;

  for (const match of content.matchAll(FENCE_PATTERN)) {
    const matchIndex: number = match.index ?? 0;
    const text: string = content.slice(cursor, matchIndex).trim();

    if (text !== "") {
      segments.push({ kind: "text", text });
    }

    const { language, path } = parseInfoString(match[1] ?? "");
    segments.push({
      kind: "code",
      code: normalizeCode(match[2] ?? ""),
      language,
      path,
    });
    cursor = matchIndex + match[0].length;
  }

  const trailingText: string = content.slice(cursor).trim();

  if (trailingText !== "") {
    segments.push({ kind: "text", text: trailingText });
  }

  if (segments.length === 0) {
    segments.push({ kind: "text", text: content });
  }

  return segments;
}

export function appendPromptTurn(messages: ChatMessage[], prompt: string): AppendPromptTurnResult {
  const nextIndex: number = messages.length + 1;
  const assistantMessageId: string = `message-${nextIndex + 1}`;

  return {
    assistantMessageId,
    messages: [
      ...messages,
      { id: `message-${nextIndex}`, role: "user", content: prompt, status: "complete" },
      { id: assistantMessageId, role: "assistant", content: "Running...", status: "pending" },
    ],
  };
}

export function completeAssistantMessage(
  messages: ChatMessage[],
  assistantMessageId: string,
  content: string,
): ChatMessage[] {
  return messages.map((message: ChatMessage) =>
    message.id === assistantMessageId
      ? { ...message, content, status: "complete" }
      : message,
  );
}

export function failAssistantMessage(
  messages: ChatMessage[],
  assistantMessageId: string,
  content: string,
): ChatMessage[] {
  return messages.map((message: ChatMessage) =>
    message.id === assistantMessageId
      ? { ...message, content, status: "error" }
      : message,
  );
}

function renderText(text: string, key: string): ReactNode {
  return text.split(/\n{2,}/).map((paragraph: string, index: number) => (
    <p key={`${key}-${index}`}>{paragraph}</p>
  ));
}

function renderSegment(segment: MessageSegment, index: number): ReactNode {
  if (segment.kind === "text") {
    return renderText(segment.text, `text-${index}`);
  }

  return (
    <figure className="message-code" key={`code-${index}`}>
      {segment.path || segment.language ? (
        <figcaption>{[segment.path, segment.language].filter(Boolean).join(" ")}</figcaption>
      ) : null}
      <pre>
        <code>{segment.code}</code>
      </pre>
    </figure>
  );
}

export function ChatTranscript({ messages }: ChatTranscriptProps): ReactElement {
  return (
    <section className="chat-transcript" aria-label="Chat transcript" aria-live="polite">
      {messages.length === 0 ? <p className="empty-chat">No messages yet.</p> : null}
      {messages.map((message: ChatMessage) => (
        <article
          className={`chat-message chat-message-${message.role} chat-message-${message.status}`}
          key={message.id}
        >
          <h2>{message.role === "user" ? "User" : "Model"}</h2>
          <div className="message-content">
            {parseMessageContent(message.content).map(renderSegment)}
          </div>
        </article>
      ))}
    </section>
  );
}
