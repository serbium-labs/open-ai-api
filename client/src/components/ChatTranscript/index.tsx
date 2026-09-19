import { useEffect, useRef, type ReactElement, type ReactNode } from "react";

import { CopyButton } from "@components/CopyButton";
import { HighlightedCode } from "@components/HighlightedCode";

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
      { id: assistantMessageId, role: "assistant", content: "", status: "pending" },
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
  const blocks: string[] = text.split(/\n{2,}/).map((block: string) => block.trim()).filter(Boolean);

  return blocks.map((block: string, index: number) => renderMarkdownBlock(block, `${key}-${index}`));
}

function renderInlineMarkdown(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern: RegExp = /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let cursor: number = 0;

  for (const match of text.matchAll(pattern)) {
    const matchIndex: number = match.index ?? 0;

    if (matchIndex > cursor) {
      nodes.push(text.slice(cursor, matchIndex));
    }

    if (match[2] !== undefined) {
      nodes.push(<code key={`${key}-code-${matchIndex}`}>{match[2]}</code>);
    } else if (match[4] !== undefined) {
      nodes.push(<strong key={`${key}-strong-${matchIndex}`}>{match[4]}</strong>);
    } else if (match[6] !== undefined && match[7] !== undefined) {
      nodes.push(
        <a key={`${key}-link-${matchIndex}`} href={match[7]} target="_blank" rel="noreferrer">
          {match[6]}
        </a>,
      );
    }

    cursor = matchIndex + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function renderMarkdownBlock(block: string, key: string): ReactNode {
  const lines: string[] = block.split("\n");
  const quoteLines: string[] = lines
    .map((line: string) => line.match(/^\\?>\s?(.*)$/)?.[1])
    .filter((line: string | undefined): line is string => line !== undefined);

  if (quoteLines.length === lines.length) {
    return (
      <blockquote key={key}>
        {quoteLines.map((line: string, index: number) => (
          <p key={`${key}-quote-${index}`}>{renderInlineMarkdown(line, `${key}-quote-${index}`)}</p>
        ))}
      </blockquote>
    );
  }

  if (quoteLines.length > 0) {
    return (
      <div className="message-markdown-group" key={key}>
        {lines.map((line: string, index: number) => {
          const quoteLine: string | undefined = line.match(/^\\?>\s?(.*)$/)?.[1];

          if (quoteLine !== undefined) {
            return (
              <blockquote key={`${key}-quote-${index}`}>
                <p>{renderInlineMarkdown(quoteLine, `${key}-quote-${index}`)}</p>
              </blockquote>
            );
          }

          return <p key={`${key}-line-${index}`}>{renderInlineMarkdown(line, `${key}-line-${index}`)}</p>;
        })}
      </div>
    );
  }

  const unorderedItems: string[] = lines
    .map((line: string) => line.match(/^\s*[-*]\s+(.+)$/)?.[1])
    .filter((line: string | undefined): line is string => line !== undefined);

  if (unorderedItems.length === lines.length) {
    return (
      <ul key={key}>
        {unorderedItems.map((item: string, index: number) => (
          <li key={`${key}-item-${index}`}>{renderInlineMarkdown(item, `${key}-item-${index}`)}</li>
        ))}
      </ul>
    );
  }

  const orderedItems: string[] = lines
    .map((line: string) => line.match(/^\s*\d+[.)]\s+(.+)$/)?.[1])
    .filter((line: string | undefined): line is string => line !== undefined);

  if (orderedItems.length === lines.length) {
    return (
      <ol key={key}>
        {orderedItems.map((item: string, index: number) => (
          <li key={`${key}-item-${index}`}>{renderInlineMarkdown(item, `${key}-item-${index}`)}</li>
        ))}
      </ol>
    );
  }

  const heading: RegExpMatchArray | null = block.match(/^(#{1,3})\s+(.+)$/);

  if (heading !== null) {
    const level: number = heading[1].length;
    const content: ReactNode[] = renderInlineMarkdown(heading[2], `${key}-heading`);

    if (level === 1) {
      return <h3 key={key}>{content}</h3>;
    }

    if (level === 2) {
      return <h4 key={key}>{content}</h4>;
    }

    return <h5 key={key}>{content}</h5>;
  }

  return <p key={key}>{renderInlineMarkdown(block, key)}</p>;
}

function renderSegment(segment: MessageSegment, index: number): ReactNode {
  if (segment.kind === "text") {
    return renderText(segment.text, `text-${index}`);
  }

  return (
    <figure className="message-code" key={`code-${index}`}>
      <figcaption>
        <span className="message-code-meta">
          {segment.language ? <span className="code-language-label">{segment.language}</span> : null}
          {segment.path ? <span className="message-code-path">{segment.path}</span> : null}
        </span>
        <CopyButton text={segment.code} label="Copy code" />
      </figcaption>
      <pre>
        <HighlightedCode code={segment.code} language={segment.language} />
      </pre>
    </figure>
  );
}

function ThinkingIndicator(): ReactElement {
  return (
    <div className="thinking-indicator" aria-label="Model is thinking">
      <span>Thinking</span>
      <span className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

function EmptyChatArt(): ReactElement {
  return (
    <div className="empty-chat-art" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" focusable="false">
        <path d="M12 6V2H8" />
        <path d="M15 11v2" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="M20 16a2 2 0 0 1-2 2H8.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 4 20.286V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
        <path d="M9 11v2" />
      </svg>
    </div>
  );
}

export function ChatTranscript({ messages }: ChatTranscriptProps): ReactElement {
  const transcriptRef = useRef<HTMLElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const transcript: HTMLElement | null = transcriptRef.current;
    const scrollAnchor: HTMLDivElement | null = scrollAnchorRef.current;

    if (transcript === null || scrollAnchor === null || messages.length === 0) {
      return;
    }

    const frameId: number = window.requestAnimationFrame(() => {
      scrollAnchor.scrollIntoView({ block: "end", behavior: "smooth" });
      transcript.scrollTop = transcript.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [messages]);

  return (
    <section
      className={`chat-transcript${messages.length === 0 ? " chat-transcript-empty" : " chat-transcript-active"}`}
      ref={transcriptRef}
      aria-label="Chat transcript"
      aria-live="polite"
    >
      {messages.length === 0 ? <EmptyChatArt /> : null}
      {messages.map((message: ChatMessage) => (
        <article
          className={`chat-message chat-message-${message.role} chat-message-${message.status}`}
          key={message.id}
        >
          <div className="message-content">
            {message.status === "pending" ? (
              <ThinkingIndicator />
            ) : (
              parseMessageContent(message.content).map(renderSegment)
            )}
          </div>
        </article>
      ))}
      <div className="chat-scroll-anchor" ref={scrollAnchorRef} aria-hidden="true" />
    </section>
  );
}
