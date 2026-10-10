import { useEffect, useReducer, useState, type ReactElement } from "react";

import { createChat, deleteChat, fetchChat, fetchChats, renameChat, submitChatMessage } from "@api";
import {
  appendPromptTurn,
  ChatTranscript,
  failAssistantMessage,
  type AppendPromptTurnResult,
} from "@components/ChatTranscript";
import { CodeFiles } from "@components/CodeFiles";
import { PromptForm } from "@components/PromptForm";
import { UI_TEXT } from "@constants";
import type { ChatDetail, ChatSummary } from "@models";

import {
  conversationStateFromChat,
  createFreshConversationState,
  getCodeStatus,
  loadChatHistory,
  loadConversation,
  type ConversationState,
} from "./conversationState";

import {
  createInitialSidebarState,
  loadSidebarPreferences,
  MOBILE_MEDIA_QUERY,
  reduceSidebarState,
  saveSidebarPreferences,
} from "./sidebarState";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function sortedSummariesWith(chat: ChatDetail, summaries: ChatSummary[]): ChatSummary[] {
  const nextSummaries: ChatSummary[] = [
    chat,
    ...summaries.filter((summary: ChatSummary) => summary.id !== chat.id),
  ];

  return nextSummaries.sort((left: ChatSummary, right: ChatSummary) => right.updatedAt.localeCompare(left.updatedAt));
}

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function App(): ReactElement {
  const [prompt, setPrompt] = useState<string>("");
  const [conversationState, setConversationState] = useState<ConversationState>(createFreshConversationState);
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);
  const { codeStatus, currentChatId, files, messages } = conversationState;
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [sidebarState, dispatchSidebarAction] = useReducer(
    reduceSidebarState,
    undefined,
    () => createInitialSidebarState(isMobileViewport(), loadSidebarPreferences(getLocalStorage())),
  );
  const { isChatHistoryOpen, isResourcesOpen } = sidebarState;
  const [chatListStatus, setChatListStatus] = useState<string>("");
  const [deletingChatId, setDeletingChatId] = useState<string | undefined>(undefined);
  const isBusy: boolean = isRunning || deletingChatId !== undefined;

  useEffect(() => {
    const mobileMediaQuery: MediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent): void => {
      dispatchSidebarAction({ type: "viewportChanged", isMobile: event.matches });
    };

    mobileMediaQuery.addEventListener("change", handleViewportChange);
    dispatchSidebarAction({ type: "viewportChanged", isMobile: mobileMediaQuery.matches });

    return () => {
      mobileMediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    saveSidebarPreferences(getLocalStorage(), sidebarState.preferences);
  }, [sidebarState.preferences]);

  useEffect(() => {
    let isMounted: boolean = true;

    async function loadInitialChats(): Promise<void> {
      try {
        const summaries: ChatSummary[] = await loadChatHistory(fetchChats);

        if (!isMounted) {
          return;
        }

        setChatSummaries(summaries);
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
    if (isBusy || chatId === currentChatId) {
      return;
    }

    setConversationState(await loadConversation(chatId, fetchChat));
    setPrompt("");
  }

  function handleNewChat(): void {
    if (messages.length === 0 || isBusy) {
      return;
    }

    setConversationState(createFreshConversationState());
    setPrompt("");
  }

  async function handleRenameChat(chat: ChatSummary): Promise<void> {
    if (isBusy) {
      return;
    }

    const title: string | null = window.prompt(UI_TEXT.renamePrompt, chat.title);

    if (title === null || title.trim() === "") {
      return;
    }

    const renamedChat: ChatDetail = await renameChat(chat.id, title.trim());
    setChatSummaries((summaries: ChatSummary[]) => sortedSummariesWith(renamedChat, summaries));
  }

  async function handleDeleteChat(chat: ChatSummary): Promise<void> {
    if (isBusy || !window.confirm(UI_TEXT.deleteChatConfirmation)) {
      return;
    }

    setDeletingChatId(chat.id);
    setChatListStatus("");

    try {
      await deleteChat(chat.id);
      setChatSummaries((summaries: ChatSummary[]) =>
        summaries.filter((summary: ChatSummary) => summary.id !== chat.id),
      );

      if (chat.id === currentChatId) {
        setConversationState(createFreshConversationState());
        setPrompt("");
      }
    } catch (error: unknown) {
      setChatListStatus(getErrorMessage(error, UI_TEXT.unexpectedError));
    } finally {
      setDeletingChatId(undefined);
    }
  }

  async function handleSubmit(submittedPrompt: string): Promise<void> {
    const nextTurn: AppendPromptTurnResult = appendPromptTurn(messages, submittedPrompt);

    setConversationState((currentState: ConversationState) => ({
      ...currentState,
      messages: nextTurn.messages,
      codeStatus: UI_TEXT.loadingCode,
    }));
    setPrompt("");
    setIsRunning(true);

    try {
      const chat: ChatDetail =
        currentChatId === undefined
          ? await createChat(undefined)
          : await fetchChat(currentChatId);
      setConversationState((currentState: ConversationState) => ({
        ...currentState,
        currentChatId: chat.id,
      }));
      const result = await submitChatMessage(chat.id, submittedPrompt);

      setChatSummaries((summaries: ChatSummary[]) => sortedSummariesWith(result.chat, summaries));
      setConversationState(conversationStateFromChat(result.chat));
    } catch (error: unknown) {
      const message: string = getErrorMessage(error, UI_TEXT.unexpectedError);

      setConversationState((currentState: ConversationState) => ({
        ...currentState,
        messages: failAssistantMessage(currentState.messages, nextTurn.assistantMessageId, message),
        codeStatus: getCodeStatus(currentState.files),
      }));
    } finally {
      setIsRunning(false);
    }
  }

  function toggleChatHistory(): void {
    dispatchSidebarAction({ type: "toggleChatHistory" });
  }

  function toggleResources(): void {
    dispatchSidebarAction({ type: "toggleResources" });
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
              disabled={messages.length === 0 || isBusy}
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
                  isBusy && chat.id !== currentChatId ? " chat-history-item-locked" : ""
                }`}
                key={chat.id}
              >
                <button
                  className="chat-history-open-button"
                  type="button"
                  disabled={isBusy && chat.id !== currentChatId}
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
                  disabled={isBusy}
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
                <button
                  className="chat-history-delete-button"
                  type="button"
                  disabled={isBusy}
                  aria-label={UI_TEXT.deleteChatButton}
                  data-tooltip={UI_TEXT.deleteChatButton}
                  onClick={() => {
                    void handleDeleteChat(chat);
                  }}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                    <path d="M8 4h8l1 2h4v2H3V6h4l1-2Zm1 6h2v8H9v-8Zm4 0h2v8h-2v-8ZM6 10h2v8h8v-8h2v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9Z" />
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
              isRunning={isBusy}
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
