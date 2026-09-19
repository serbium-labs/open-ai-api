import type { ChatDetail, ChatSummary } from "@models";

export type ChatListResponse = {
  chats: ChatSummary[];
};

export type ChatDetailResponse = {
  chat: ChatDetail;
};

export type ChatPromptResponse = {
  chat: ChatDetail;
  finalResponse: string;
};

export type ErrorResponse = {
  error: string;
};
