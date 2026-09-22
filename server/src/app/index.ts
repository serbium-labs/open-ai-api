import express, { type Express } from "express";

import { API_ROUTES } from "#constants";
import { createServerConfig, type ServerConfig } from "#config";
import { createChatsRouter } from "#routes/chats";
import { ChatArchiveService } from "#services/chat-archive";
import { CodexService } from "#services/codex";

export type AppDependencies = {
  config?: ServerConfig;
  codexService?: CodexService;
  chatArchiveService?: ChatArchiveService;
};

export function createApp(dependencies: AppDependencies = {}): Express {
  const config: ServerConfig = dependencies.config ?? createServerConfig();
  const codexService: CodexService =
    dependencies.codexService ?? new CodexService({
      workingDirectory: config.repositoryRoot,
      model: config.codexModel,
    });
  const chatArchiveService: ChatArchiveService =
    dependencies.chatArchiveService ?? new ChatArchiveService(config.chatArchiveDirectory);
  const app: Express = express();

  app.use(express.json());
  app.use(API_ROUTES.chats, createChatsRouter(codexService, chatArchiveService));

  return app;
}
