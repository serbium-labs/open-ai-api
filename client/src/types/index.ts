export type CodeFile = {
  path: string;
  content: string;
};

export type ChatAttachment = {
  name: string;
  mimeType: string;
  path: string;
};

export type ChatResource = CodeFile & {
  id: string;
  messageId: string;
  language?: string;
  createdAt: string;
};

export type PersistedChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  resources: string[];
  attachments: ChatAttachment[];
};

export type ChatSummary = {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatDetail = ChatSummary & {
  messages: PersistedChatMessage[];
  resources: ChatResource[];
};