import express, { type Express } from "express";

import { API_ROUTES } from "#constants";
import { createServerConfig, type ServerConfig } from "#config";
import { createCodeRouter } from "#routes/code";
import { createCodexRouter } from "#routes/codex";
import { CodexService } from "#services/codex";
import { ResponseStorage } from "#services/responses";
import { WorkspaceService } from "#services/workspace";

export type AppDependencies = {
  config?: ServerConfig;
  workspaceService?: WorkspaceService;
  codexService?: CodexService;
  responseStorage?: ResponseStorage;
};

export function createApp(dependencies: AppDependencies = {}): Express {
  const config: ServerConfig = dependencies.config ?? createServerConfig();
  const workspaceService: WorkspaceService =
    dependencies.workspaceService ?? new WorkspaceService(config.workspaceDirectory);
  const codexService: CodexService =
    dependencies.codexService ?? new CodexService({ workingDirectory: config.workspaceDirectory });
  const responseStorage: ResponseStorage =
    dependencies.responseStorage ?? new ResponseStorage({ directory: config.responsesDirectory });
  const app: Express = express();

  app.use(express.json());
  app.use(API_ROUTES.code, createCodeRouter(workspaceService));
  app.use(API_ROUTES.codex, createCodexRouter(codexService, responseStorage));

  return app;
}
