import { Router, type Request, type Response } from "express";

import { HTTP_STATUS } from "#constants";
import type { WorkspaceService } from "#services/workspace";
import type { CodeFilesResponse, ErrorResponse } from "#models";

export function createCodeRouter(workspaceService: WorkspaceService): Router {
  const router: Router = Router();

  router.get("/", async (_request: Request, response: Response<CodeFilesResponse | ErrorResponse>) => {
    try {
      response.status(HTTP_STATUS.ok).json({ files: await workspaceService.readCodeWorkspace() });
    } catch (error: unknown) {
      response.status(HTTP_STATUS.internalServerError).json({
        error: error instanceof Error ? error.message : "Unexpected server error",
      });
    }
  });

  return router;
}
