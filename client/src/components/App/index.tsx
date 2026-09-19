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

  async function handleSubmit(submittedPrompt: string): Promise<void> {
    const nextTurn: AppendPromptTurnResult = appendPromptTurn(messages, submittedPrompt);

    setMessages(nextTurn.messages);
    setPrompt("");
    setIsRunning(true);
    setCodeStatus(UI_TEXT.loadingCode);

    try {
      await submitAndRefresh(submittedPrompt, {
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
      setCodeStatus(getCodeStatus(files));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <>
      <main className={`app-shell${isResourcesOpen ? " app-shell-with-resources" : ""}`}>
        <div className="chat-layout">
          <section
            className={`chat-column${messages.length === 0 ? " chat-column-empty" : " chat-column-active"}`}
            aria-label="Chat"
          >
            <ChatTranscript messages={messages} />
            <PromptForm
              prompt={prompt}
              isRunning={isRunning}
              onPromptChange={setPrompt}
              onSubmit={(submittedPrompt: string) => {
                void handleSubmit(submittedPrompt);
              }}
            />
          </section>
        </div>
      </main>
      <button
        className={`resources-toggle${isResourcesOpen ? " resources-toggle-open" : ""}`}
        type="button"
        aria-label={isResourcesOpen ? UI_TEXT.hideResourcesButton : UI_TEXT.resourcesButton}
        aria-expanded={isResourcesOpen}
        data-tooltip={isResourcesOpen ? UI_TEXT.hideResourcesTooltip : UI_TEXT.resourcesTooltip}
        onClick={() => setIsResourcesOpen((isOpen: boolean) => !isOpen)}
      >
        {isResourcesOpen ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13ZM6.5 5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5H10V5H6.5ZM12 5v14h5.5a.5.5 0 0 0 .5-.5v-13a.5.5 0 0 0-.5-.5H12Z" />
          </svg>
        )}
      </button>
      {isResourcesOpen ? (
        <aside className="resources-sidebar" aria-label="Chat resources">
          <CodeFiles files={files} status={codeStatus} />
        </aside>
      ) : null}
    </>
  );
}
