import { useEffect, useState, type ReactElement } from "react";

import { createChat, fetchChat, fetchChats, renameChat, submitChatMessage } from "@api";
import {
  appendPromptTurn,
  ChatTranscript,
  failAssistantMessage,
  type AppendPromptTurnResult,
  type ChatMessage,
} from "@components/ChatTranscript";
import { CodeFiles } from "@components/CodeFiles";
import { PromptForm } from "@components/PromptForm";
import { UI_TEXT } from "@constants";
import type { ChatDetail, ChatSummary, CodeFile, PersistedChatMessage } from "@models";

function getCodeStatus(files: CodeFile[]): string {
  if (files.length === 0) {
    return UI_TEXT.emptyCode;
  }

  return `${files.length} file${files.length === 1 ? "" : "s"}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function toChatMessages(messages: PersistedChatMessage[]): ChatMessage[] {
  return messages.map((message: PersistedChatMessage) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    status: "complete",
  }));
}

function applyChatDetail(chat: ChatDetail): {
  messages: ChatMessage[];
  files: CodeFile[];
  codeStatus: string;
} {
  return {
    messages: toChatMessages(chat.messages),
    files: chat.resources,
    codeStatus: getCodeStatus(chat.resources),
  };
}

function sortedSummariesWith(chat: ChatDetail, summaries: ChatSummary[]): ChatSummary[] {
  const nextSummaries: ChatSummary[] = [
    chat,
    ...summaries.filter((summary: ChatSummary) => summary.id !== chat.id),
  ];

  return nextSummaries.sort((left: ChatSummary, right: ChatSummary) => right.updatedAt.localeCompare(left.updatedAt));
}

function isMobileViewport(): boolean {
  return window.matchMedia("(max-width: 640px)").matches;
}

export function App(): ReactElement {
  const [prompt, setPrompt] = useState<string>("");
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [codeStatus, setCodeStatus] = useState<string>(UI_TEXT.emptyCode);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | undefined>(undefined);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState<boolean>(true);
  const [isResourcesOpen, setIsResourcesOpen] = useState<boolean>(false);
  const [chatListStatus, setChatListStatus] = useState<string>("");

  useEffect(() => {
    let isMounted: boolean = true;

    async function loadInitialChats(): Promise<void> {
      try {
        const summaries: ChatSummary[] = await fetchChats();

        if (!isMounted) {
          return;
        }

        setChatSummaries(summaries);

        if (summaries.length === 0) {
          return;
        }

        const chat: ChatDetail = await fetchChat(summaries[0].id);

        if (!isMounted) {
          return;
        }

        const detail = applyChatDetail(chat);
        setCurrentChatId(chat.id);
        setMessages(detail.messages);
        setFiles(detail.files);
        setCodeStatus(detail.codeStatus);
      } catch (error: unknown) {
        if (isMounted) {
          setChatListStatus(getErrorMessage(error, UI_TEXT.unexpectedError));
        }
      }
    }

    void loadInitialChats();

    return () => {
      isMounted = false;
    };
  }, []);

  async function openChat(chatId: string): Promise<void> {
    if (isRunning || chatId === currentChatId) {
      return;
    }

    const chat: ChatDetail = await fetchChat(chatId);
    const detail = applyChatDetail(chat);

    setCurrentChatId(chat.id);
    setMessages(detail.messages);
    setFiles(detail.files);
    setCodeStatus(detail.codeStatus);
    setPrompt("");
  }

  function handleNewChat(): void {
    if (messages.length === 0 || isRunning) {
      return;
    }

    setCurrentChatId(undefined);
    setMessages([]);
    setFiles([]);
    setCodeStatus(UI_TEXT.emptyCode);
    setPrompt("");
  }

  async function handleRenameChat(chat: ChatSummary): Promise<void> {
    if (isRunning) {
      return;
    }

    const title: string | null = window.prompt(UI_TEXT.renamePrompt, chat.title);

    if (title === null || title.trim() === "") {
      return;
    }

    const renamedChat: ChatDetail = await renameChat(chat.id, title.trim());
    setChatSummaries((summaries: ChatSummary[]) => sortedSummariesWith(renamedChat, summaries));
  }

  async function handleSubmit(submittedPrompt: string): Promise<void> {
    const nextTurn: AppendPromptTurnResult = appendPromptTurn(messages, submittedPrompt);

    setMessages(nextTurn.messages);
    setPrompt("");
    setIsRunning(true);
    setCodeStatus(UI_TEXT.loadingCode);

    try {
      const chat: ChatDetail =
        currentChatId === undefined
          ? await createChat(undefined)
          : await fetchChat(currentChatId);
      setCurrentChatId(chat.id);
      const result = await submitChatMessage(chat.id, submittedPrompt);
      const detail = applyChatDetail(result.chat);

      setCurrentChatId(result.chat.id);
      setChatSummaries((summaries: ChatSummary[]) => sortedSummariesWith(result.chat, summaries));
      setMessages(detail.messages);
      setFiles(detail.files);
      setCodeStatus(detail.codeStatus);
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

  function toggleChatHistory(): void {
    const nextIsOpen: boolean = !isChatHistoryOpen;

    setIsChatHistoryOpen(nextIsOpen);

    if (nextIsOpen && isMobileViewport()) {
      setIsResourcesOpen(false);
    }
  }

  function toggleResources(): void {
    const nextIsOpen: boolean = !isResourcesOpen;

    setIsResourcesOpen(nextIsOpen);

    if (nextIsOpen && isMobileViewport()) {
      setIsChatHistoryOpen(false);
    }
  }

  return (
    <>
      {isChatHistoryOpen ? (
        <aside className="chat-history-sidebar" aria-label="Saved chats">
          <div className="chat-history-header">
            <h2>{UI_TEXT.chatHistoryTitle}</h2>
            <button
              className="chat-history-new-button"
              type="button"
              disabled={messages.length === 0 || isRunning}
              aria-label={UI_TEXT.newChatButton}
              data-tooltip={messages.length === 0 ? UI_TEXT.emptyChatTooltip : UI_TEXT.newChatButton}
              onClick={handleNewChat}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
              </svg>
            </button>
          </div>
          {chatListStatus ? <p className="chat-history-status">{chatListStatus}</p> : null}
          <nav className="chat-history-list" aria-label="Chat history">
            {chatSummaries.map((chat: ChatSummary) => (
              <div
                className={`chat-history-item${chat.id === currentChatId ? " chat-history-item-active" : ""}${
                  isRunning && chat.id !== currentChatId ? " chat-history-item-locked" : ""
                }`}
                key={chat.id}
              >
                <button
                  className="chat-history-open-button"
                  type="button"
                  disabled={isRunning && chat.id !== currentChatId}
                  aria-current={chat.id === currentChatId ? "page" : undefined}
                  onClick={() => {
                    void openChat(chat.id);
                  }}
                >
                  <span>{chat.title}</span>
                  <small>{chat.date}</small>
                </button>
                <button
                  className="chat-history-rename-button"
                  type="button"
                  disabled={isRunning}
                  aria-label={UI_TEXT.renameChatButton}
                  data-tooltip={UI_TEXT.renameChatButton}
                  onClick={() => {
                    void handleRenameChat(chat);
                  }}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                    <path d="m4 16.6-.7 4.1 4.1-.7L18.7 8.7l-3.4-3.4L4 16.6Zm13.2-12.7 3 3 .8-.8a2.1 2.1 0 0 0-3-3l-.8.8Z" />
                  </svg>
                </button>
              </div>
            ))}
          </nav>
        </aside>
      ) : null}
      <button
        className={`chat-history-toggle${isChatHistoryOpen ? " chat-history-toggle-open" : ""}`}
        type="button"
        aria-label={isChatHistoryOpen ? UI_TEXT.hideChatHistoryButton : UI_TEXT.chatHistoryButton}
        aria-expanded={isChatHistoryOpen}
        data-tooltip={isChatHistoryOpen ? UI_TEXT.hideChatHistoryTooltip : UI_TEXT.chatHistoryTooltip}
        onClick={toggleChatHistory}
      >
        {isChatHistoryOpen ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13ZM6.5 5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5H10V5H6.5ZM12 5v14h5.5a.5.5 0 0 0 .5-.5v-13a.5.5 0 0 0-.5-.5H12Z" />
          </svg>
        )}
      </button>
      <main className={`app-shell${isChatHistoryOpen ? " app-shell-with-history" : ""}${isResourcesOpen ? " app-shell-with-resources" : ""}`}>
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
        onClick={toggleResources}
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
