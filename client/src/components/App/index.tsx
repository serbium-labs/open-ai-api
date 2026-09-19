import { useState, type ReactElement } from "react";

import { submitAndRefresh } from "@api";
import {
  appendPromptTurn,
  ChatTranscript,
  completeAssistantMessage,
  failAssistantMessage,
  type AppendPromptTurnResult,
  type ChatMessage,
} from "@components/ChatTranscript";
import { CodeFiles } from "@components/CodeFiles";
import { PromptForm } from "@components/PromptForm";
import { UI_TEXT } from "@constants";
import type { CodeFile } from "@models";

function getCodeStatus(files: CodeFile[]): string {
  if (files.length === 0) {
    return UI_TEXT.emptyCode;
  }

  return `${files.length} file${files.length === 1 ? "" : "s"}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function App(): ReactElement {
  const [prompt, setPrompt] = useState<string>("");
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [codeStatus, setCodeStatus] = useState<string>(UI_TEXT.emptyCode);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState<boolean>(false);

  async function handleSubmit(): Promise<void> {
    const nextTurn: AppendPromptTurnResult = appendPromptTurn(messages, prompt);

    setMessages(nextTurn.messages);
    setIsRunning(true);
    setCodeStatus(UI_TEXT.loadingCode);

    try {
      await submitAndRefresh(prompt, {
        onFinalResponse(finalResponse: string): void {
          setMessages((currentMessages: ChatMessage[]) =>
            completeAssistantMessage(currentMessages, nextTurn.assistantMessageId, finalResponse),
          );
        },
        onCodeFiles(codeFiles: CodeFile[]): void {
          setFiles(codeFiles);
          setCodeStatus(getCodeStatus(codeFiles));
        },
      });
    } catch (error: unknown) {
      const message: string = getErrorMessage(error, UI_TEXT.unexpectedError);

      setMessages((currentMessages: ChatMessage[]) =>
        failAssistantMessage(currentMessages, nextTurn.assistantMessageId, message),
      );
      setCodeStatus(`Unable to refresh code: ${message}`);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="app-shell">
      <ChatTranscript messages={messages} />
      <PromptForm
        prompt={prompt}
        isRunning={isRunning}
        onPromptChange={setPrompt}
        onSubmit={() => {
          void handleSubmit();
        }}
      />
      <button
        className="resources-toggle"
        type="button"
        aria-expanded={isResourcesOpen}
        onClick={() => setIsResourcesOpen((isOpen: boolean) => !isOpen)}
      >
        {isResourcesOpen ? UI_TEXT.hideResourcesButton : UI_TEXT.resourcesButton}
      </button>
      {isResourcesOpen ? <CodeFiles files={files} status={codeStatus} /> : null}
    </main>
  );
}
