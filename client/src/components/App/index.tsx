import { useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { Check, MoreVertical, X } from "lucide-react";

import { createChat, deleteChat, fetchChat, fetchChats, renameChat, submitChatMessage } from "@api";
import {
  appendPromptTurn,
  ChatTranscript,
  failAssistantMessage,
  type AppendPromptTurnResult,
  type ChatMessage,
  type ChatMessageAttachment,
} from "@components/ChatTranscript";
import { CodeFiles, combineResources, type DisplayResource } from "@components/CodeFiles";
import { PromptForm } from "@components/PromptForm";
import {
  resolveResourceNavigation,
  type ResourceNavigationTarget,
} from "@components/resourceNavigation";
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
import { advanceComposerSessionId } from "./composerSession";

import {
  createInitialSidebarState,
  loadSidebarPreferences,
  MOBILE_MEDIA_QUERY,
  reduceSidebarState,
  saveSidebarPreferences,
} from "./sidebarState";
import {
  getChatHistoryTooltipPosition,
  getResourcesTooltipPosition,
} from "./sidebarTooltips";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function sortedSummariesWith(chat: ChatDetail, summaries: ChatSummary[]): ChatSummary[] {
  const nextSummaries: ChatSummary[] = [
    chat,
    ...summaries.filter(
      (summary: ChatSummary) => summary.id !== chat.id,
    ),
  ];

  return nextSummaries.sort(
    (left: ChatSummary, right: ChatSummary) =>
      right.updatedAt.localeCompare(left.updatedAt),
  );
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
  const optimisticAttachmentUrlsRef = useRef<Set<string>>(new Set());
  const [composerSessionId, setComposerSessionId] = useState<number>(0);
  const [prompt, setPrompt] = useState<string>("");
  const [conversationState, setConversationState] = useState<ConversationState>(createFreshConversationState);
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);
  const { codeStatus, currentChatId, files, messages } = conversationState;
  const displayResources: DisplayResource[] = combineResources(files, messages, currentChatId);
  const resourcesStatus: string = codeStatus === UI_TEXT.loadingCode
    ? codeStatus
    : displayResources.length === 0
      ? UI_TEXT.emptyResources
      : `${displayResources.length} resource${displayResources.length === 1 ? "" : "s"}`;
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isUploadingAttachments, setIsUploadingAttachments] =
    useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sidebarState, dispatchSidebarAction] = useReducer(
    reduceSidebarState,
    undefined,
    () => createInitialSidebarState(isMobileViewport(), loadSidebarPreferences(getLocalStorage())),
  );
  const { isChatHistoryOpen, isResourcesOpen } = sidebarState;
  const chatHistoryTooltipPosition = getChatHistoryTooltipPosition(
    isChatHistoryOpen,
    isResourcesOpen,
  );
  const resourcesTooltipPosition = getResourcesTooltipPosition(
    isResourcesOpen,
    isChatHistoryOpen,
  );
  const [chatListStatus, setChatListStatus] = useState<string>("");
  const [deletingChatId, setDeletingChatId] = useState<string | undefined>(undefined);
  const [editingChatId, setEditingChatId] = useState<string | undefined>(undefined);
  const [renameDraft, setRenameDraft] = useState<string>("");
  const [renamingChatId, setRenamingChatId] = useState<string | undefined>(undefined);
  const [openChatMenuId, setOpenChatMenuId] = useState<string | undefined>(undefined);
  const [resourceNavigationTarget, setResourceNavigationTarget] = useState<ResourceNavigationTarget | undefined>();
  const resourceNavigationRequestId = useRef<number>(0);
  const openChatRequestId = useRef<number>(0);
  const isBusy: boolean = isRunning || deletingChatId !== undefined || renamingChatId !== undefined;

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
    if (openChatMenuId === undefined) {
      return;
    }

    const closeMenuOnOutsideClick = (event: PointerEvent): void => {
      if (!(event.target instanceof Element) || !event.target.closest(".chat-history-actions")) {
        setOpenChatMenuId(undefined);
      }
    };
    const closeMenuOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpenChatMenuId(undefined);
      }
    };

    document.addEventListener("pointerdown", closeMenuOnOutsideClick);
    document.addEventListener("keydown", closeMenuOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeMenuOnOutsideClick);
      document.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [openChatMenuId]);

  useEffect(() => {
    setResourceNavigationTarget(undefined);
  }, [currentChatId]);

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
          setChatListStatus(
            getErrorMessage(error, UI_TEXT.unexpectedError),
          );
        }
      }
    }

    void loadInitialChats();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const activeUrls = new Set(
      messages.flatMap((message: ChatMessage) =>
        message.attachments.flatMap(
          (attachment: ChatMessageAttachment) =>
            attachment.previewUrl === undefined
              ? []
              : [attachment.previewUrl],
        ),
      ),
    );

    for (const url of optimisticAttachmentUrlsRef.current) {
      if (!activeUrls.has(url)) {
        URL.revokeObjectURL(url);
        optimisticAttachmentUrlsRef.current.delete(url);
      }
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      for (const url of optimisticAttachmentUrlsRef.current) {
        URL.revokeObjectURL(url);
      }

      optimisticAttachmentUrlsRef.current.clear();
    };
  }, []);

  async function openChat(chatId: string): Promise<void> {
    if (isBusy) {
      return;
    }

    openChatRequestId.current += 1;

    if (chatId === currentChatId) {
      return;
    }

    const requestId: number = openChatRequestId.current;
    const nextConversation: ConversationState =
      await loadConversation(chatId, fetchChat);

    if (requestId !== openChatRequestId.current) {
      return;
    }

    setConversationState(nextConversation);
    setPrompt("");
    setComposerSessionId(advanceComposerSessionId);
  }

  function handleNewChat(): void {
    if (messages.length === 0 || isBusy) {
      return;
    }

    openChatRequestId.current += 1;
    setConversationState(createFreshConversationState());
    setPrompt("");
    setComposerSessionId(advanceComposerSessionId);
  }

  function startRenamingChat(chat: ChatSummary): void {
    setOpenChatMenuId(undefined);
    setEditingChatId(chat.id);
    setRenameDraft(chat.title);
    setChatListStatus("");
  }

  function cancelRenamingChat(): void {
    if (renamingChatId !== undefined) {
      return;
    }

    setEditingChatId(undefined);
    setRenameDraft("");
  }

  async function handleRenameChat(chat: ChatSummary): Promise<void> {
    const title: string = renameDraft.trim();

    if (isBusy || title === "") {
      return;
    }

    if (title === chat.title) {
      cancelRenamingChat();
      return;
    }

    setRenamingChatId(chat.id);
    setChatListStatus("");

    try {
      const renamedChat: ChatDetail = await renameChat(chat.id, title);

      setChatSummaries((summaries: ChatSummary[]) =>
        sortedSummariesWith(renamedChat, summaries),
      );
      setEditingChatId(undefined);
      setRenameDraft("");
    } catch (error: unknown) {
      setChatListStatus(getErrorMessage(error, UI_TEXT.unexpectedError));
    } finally {
      setRenamingChatId(undefined);
    }
  }

  async function handleSubmit(
    submittedPrompt: string,
    attachments: File[],
  ): Promise<boolean> {
    const optimisticAttachments: ChatMessageAttachment[] = attachments.map((attachment: File) => {
      const previewUrl: string = URL.createObjectURL(attachment);
      optimisticAttachmentUrlsRef.current.add(previewUrl);
      return {
        name: attachment.name,
        mimeType: attachment.type || "application/octet-stream",
        path: "",
        previewUrl,
      };
    });

    const nextTurn: AppendPromptTurnResult = appendPromptTurn(
      messages,
      submittedPrompt,
      optimisticAttachments,
    );

    setConversationState((currentState: ConversationState) => ({
      ...currentState,
      messages: nextTurn.messages,
      codeStatus: UI_TEXT.loadingCode,
    }));
    setPrompt("");

    setSubmitError(null);
    setIsUploadingAttachments(attachments.length > 0);
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
      const result = await submitChatMessage(
        chat.id,
        submittedPrompt,
        attachments,
        fetch,
        () => setIsUploadingAttachments(false),
      );

      setChatSummaries((summaries: ChatSummary[]) => sortedSummariesWith(result.chat, summaries));
      setConversationState(conversationStateFromChat(result.chat));
      setPrompt("");
      return true;
    } catch (error: unknown) {
      const message: string = getErrorMessage(error, UI_TEXT.unexpectedError);

      setConversationState((currentState: ConversationState) => ({
        ...currentState,
        messages: failAssistantMessage(
          currentState.messages,
          nextTurn.assistantMessageId,
          message,
        ),
        codeStatus: getCodeStatus(currentState.files),
      }));
      return false;
    } finally {
      setIsUploadingAttachments(false);
      setIsRunning(false);
    }
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
        setComposerSessionId(advanceComposerSessionId);
      }
    } catch (error: unknown) {
      setChatListStatus(getErrorMessage(error, UI_TEXT.unexpectedError));
    } finally {
      setDeletingChatId(undefined);
    }
  }


  function toggleChatHistory(): void {
    setOpenChatMenuId(undefined);
    dispatchSidebarAction({ type: "toggleChatHistory" });
  }

  function toggleResources(): void {
    dispatchSidebarAction({ type: "toggleResources" });
  }

  function handleResourceNavigate(resourceId: string): void {
    resourceNavigationRequestId.current += 1;
    setResourceNavigationTarget(
      resolveResourceNavigation(displayResources, resourceId, resourceNavigationRequestId.current),
    );
  }

  return (
    <>
      {isChatHistoryOpen ? (
        <aside
          className="chat-history-sidebar"
          aria-label="Saved chats"
        >
          <div className="chat-history-header">
            <h2>{UI_TEXT.chatHistoryTitle}</h2>

            <button
              className="chat-history-new-button"
              type="button"
              disabled={messages.length === 0 || isBusy}
              aria-label={UI_TEXT.newChatButton}
              data-tooltip={messages.length === 0 ? UI_TEXT.emptyChatTooltip : UI_TEXT.newChatButton}
              data-tooltip-placement="left"
              onClick={handleNewChat}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                focusable="false"
              >
                <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
              </svg>
            </button>
          </div>

          {chatListStatus ? (
            <p className="chat-history-status">
              {chatListStatus}
            </p>
          ) : null}

          <nav
            className="chat-history-list"
            aria-label="Chat history"
          >
            {chatSummaries.map((chat: ChatSummary) => (
              <div
                className={`chat-history-item${chat.id === currentChatId ? " chat-history-item-active" : ""}${
                  isBusy && chat.id !== currentChatId ? " chat-history-item-locked" : ""
                }`}
                key={chat.id}
              >
                {editingChatId === chat.id ? (
                  <form
                    className="chat-history-rename-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleRenameChat(chat);
                    }}
                  >
                    <input
                      autoFocus
                      aria-label={UI_TEXT.renamePrompt}
                      value={renameDraft}
                      disabled={renamingChatId === chat.id}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRenamingChat();
                        }
                      }}
                    />
                    <div className="chat-history-rename-actions">
                      <button
                        type="submit"
                        disabled={renamingChatId === chat.id || renameDraft.trim() === ""}
                        aria-label={UI_TEXT.saveRenameAction}
                        title={UI_TEXT.saveRenameAction}
                      >
                        <Check aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={renamingChatId === chat.id}
                        aria-label={UI_TEXT.cancelRenameAction}
                        title={UI_TEXT.cancelRenameAction}
                        onClick={cancelRenamingChat}
                      >
                        <X aria-hidden="true" />
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
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

                    <div className="chat-history-actions">
                      <button
                        className="chat-history-menu-button"
                        type="button"
                        disabled={isBusy}
                        aria-label={UI_TEXT.chatActionsButton}
                        aria-haspopup="menu"
                        aria-expanded={openChatMenuId === chat.id}
                        onClick={() => {
                          setOpenChatMenuId((openId: string | undefined) =>
                            openId === chat.id ? undefined : chat.id,
                          );
                        }}
                      >
                        <MoreVertical aria-hidden="true" />
                      </button>

                      {openChatMenuId === chat.id ? (
                        <div className="chat-history-menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => startRenamingChat(chat)}
                          >
                            {UI_TEXT.renameChatAction}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenChatMenuId(undefined);
                              void handleDeleteChat(chat);
                            }}
                          >
                            {UI_TEXT.deleteChatAction}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ))}
          </nav>
        </aside>
      ) : null}

      <button
        className={`chat-history-toggle${
          isChatHistoryOpen
            ? " chat-history-toggle-open"
            : ""
        }`}
        type="button"
        aria-label={
          isChatHistoryOpen
            ? UI_TEXT.hideChatHistoryButton
            : UI_TEXT.chatHistoryButton
        }
        aria-expanded={isChatHistoryOpen}
        data-tooltip={isChatHistoryOpen ? UI_TEXT.hideChatHistoryTooltip : UI_TEXT.chatHistoryTooltip}
        data-tooltip-placement={chatHistoryTooltipPosition.placement}
        data-tooltip-align={chatHistoryTooltipPosition.align}
        onClick={toggleChatHistory}
      >
        {isChatHistoryOpen ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            focusable="false"
          >
            <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            focusable="false"
          >
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13ZM6.5 5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5H10V5H6.5ZM12 5v14h5.5a.5.5 0 0 0 .5-.5v-13a.5.5 0 0 0-.5-.5H12Z" />
          </svg>
        )}
      </button>

      <main
        className={`app-shell${
          isChatHistoryOpen
            ? " app-shell-with-history"
            : ""
        }${
          isResourcesOpen
            ? " app-shell-with-resources"
            : ""
        }`}
      >
        <div className="chat-layout">
          <section
            className={`chat-column${
              messages.length === 0
                ? " chat-column-empty"
                : " chat-column-active"
            }`}
            aria-label="Chat"
          >
            <ChatTranscript
              messages={messages}
              chatId={currentChatId}
              isUploadingAttachments={isUploadingAttachments}
              resourceNavigationTarget={resourceNavigationTarget}
            />
            <PromptForm
              key={composerSessionId}
              prompt={prompt}
              isRunning={isBusy}
              submitError={submitError}
              onPromptChange={setPrompt}
              onSubmit={(
                submittedPrompt: string,
                attachments: File[],
              ) =>
                handleSubmit(
                  submittedPrompt,
                  attachments,
                )
              }
            />
          </section>
        </div>
      </main>

      <button
        className={`resources-toggle${
          isResourcesOpen
            ? " resources-toggle-open"
            : ""
        }`}
        type="button"
        aria-label={
          isResourcesOpen
            ? UI_TEXT.hideResourcesButton
            : UI_TEXT.resourcesButton
        }
        aria-expanded={isResourcesOpen}
        data-tooltip={isResourcesOpen ? UI_TEXT.hideResourcesTooltip : UI_TEXT.resourcesTooltip}
        data-tooltip-placement={resourcesTooltipPosition.placement}
        data-tooltip-align={resourcesTooltipPosition.align}
        onClick={toggleResources}
      >
        {isResourcesOpen ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            focusable="false"
          >
            <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            focusable="false"
          >
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13ZM6.5 5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5H10V5H6.5ZM12 5v14h5.5a.5.5 0 0 0 .5-.5v-13a.5.5 0 0 0-.5-.5H12Z" />
          </svg>
        )}
      </button>

      {isResourcesOpen ? (
        <aside className="resources-sidebar" aria-label="Chat resources">
          <CodeFiles
            files={displayResources}
            status={resourcesStatus}
            onResourceNavigate={handleResourceNavigate}
          />
        </aside>
      ) : null}
    </>
  );
}
