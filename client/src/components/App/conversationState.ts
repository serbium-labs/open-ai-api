import type { ChatMessage } from "@components/ChatTranscript";
import { UI_TEXT } from "@constants";
import type { ChatDetail, ChatSummary, CodeFile, PersistedChatMessage } from "@models";

export type ConversationState = {
  currentChatId: string | undefined;
  messages: ChatMessage[];
  files: CodeFile[];
  codeStatus: string;
};

export function getCodeStatus(files: CodeFile[]): string {
  if (files.length === 0) {
    return UI_TEXT.emptyCode;
  }

  return `${files.length} file${files.length === 1 ? "" : "s"}`;
}

export function createFreshConversationState(): ConversationState {
  return {
    currentChatId: undefined,
    messages: [],
    files: [],
    codeStatus: UI_TEXT.emptyCode,
  };
}

export function conversationStateFromChat(chat: ChatDetail): ConversationState {
  return {
    currentChatId: chat.id,
    messages: chat.messages.map((message: PersistedChatMessage) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      status: "complete",
    })),
    files: chat.resources,
    codeStatus: getCodeStatus(chat.resources),
  };
}

export async function loadConversation(
  chatId: string,
  loadChat: (selectedChatId: string) => Promise<ChatDetail>,
): Promise<ConversationState> {
  return conversationStateFromChat(await loadChat(chatId));
}

export async function loadChatHistory(
  loadSummaries: () => Promise<ChatSummary[]>,
): Promise<ChatSummary[]> {
  return loadSummaries();
}
